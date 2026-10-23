import "server-only";
import { isLocale, type Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import type { OutgoingMessage, SendResult } from "@/lib/notifications/telegram";
import { PHOTO_BUCKET } from "@/lib/progress/photos";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildExport, EXPORT_BUCKET, removeFolder } from "./export";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Buckets whose objects sit in a folder named by the owner's id. */
const OWNER_BUCKETS = [PHOTO_BUCKET, "avatars", "certificates", "feedback", EXPORT_BUCKET] as const;

export type PrivacySummary = {
  expired: number;
  built: number;
  failed: number;
  purged: number;
  healthErased: number;
  retained: number;
  csvRemoved: number;
};

/** Sends one Telegram message (lib/notifications/telegram); the route binds the bot token. */
export type SendTelegram = (message: OutgoingMessage) => Promise<SendResult>;

async function localeOf(admin: Admin, userId: string): Promise<Locale> {
  const { data } = await admin.from("user_settings").select("locale").eq("user_id", userId).maybeSingle();
  return isLocale(data?.locale) ? data.locale : "ru";
}

/** Archives past their 7 days: the files go, the row stays as history ("Срок скачивания прошёл"). */
async function expireExports(admin: Admin, summary: PrivacySummary) {
  const { data, error } = await admin
    .from("data_exports")
    .select("id, storage_path")
    .eq("status", "ready")
    .lte("expires_at", new Date().toISOString())
    .limit(20);
  if (error) throw new Error(`reading expired exports failed: ${error.code}`);
  for (const row of data) {
    if (row.storage_path) await removeFolder(admin, EXPORT_BUCKET, row.storage_path);
    const { error: update } = await admin.from("data_exports").update({ status: "expired" }).eq("id", row.id).eq("status", "ready");
    if (update) throw new Error(`expiring an export failed: ${update.code}`);
    summary.expired += 1;
  }
}

async function buildExports(admin: Admin, summary: PrivacySummary, hasTime: () => boolean) {
  while (hasTime()) {
    const { data, error } = await admin.rpc("claim_data_exports", { p_limit: 1 });
    if (error) throw new Error(`claim_data_exports failed: ${error.code}`);
    const [job] = data;
    if (!job) return;
    try {
      const folder = await buildExport(admin, job.id, job.user_id, await localeOf(admin, job.user_id));
      const { error: done } = await admin.rpc("complete_data_export", { p_id: job.id, p_storage_path: folder });
      if (done) throw new Error(`complete_data_export failed: ${done.code}`);
      summary.built += 1;
    } catch (cause) {
      console.error("building an export failed", cause instanceof Error ? cause.message : "unknown");
      await removeFolder(admin, EXPORT_BUCKET, `${job.user_id}/${job.id}`).catch(() => undefined);
      await admin.rpc("fail_data_export", { p_id: job.id });
      summary.failed += 1;
    }
  }
}

/**
 * Accounts 30 days after the request (data-model §1.6-4): the Storage objects of the user and of a trainer's
 * client cards first, then the anonymization, then the Auth users. A failure leaves the request due, so the
 * next run repeats what is left; every step is safe to repeat.
 */
async function purgeAccounts(admin: Admin, summary: PrivacySummary, hasTime: () => boolean, send?: SendTelegram) {
  const { data, error } = await admin
    .from("account_deletions")
    .select("user_id")
    .is("cancelled_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(10);
  if (error) throw new Error(`reading due deletions failed: ${error.code}`);
  for (const { user_id: userId } of data) {
    if (!hasTime()) return;
    // Read before the purge: the profile and its chat go with the account.
    const { data: profile } = await admin.from("profiles").select("telegram_id, bot_blocked_at").eq("id", userId).maybeSingle();
    const locale = await localeOf(admin, userId);
    const { data: cards, error: cardsError } = await admin.from("profiles").select("id").eq("managed_by_trainer_id", userId);
    if (cardsError) throw new Error(`reading client cards failed: ${cardsError.code}`);
    for (const owner of [userId, ...cards.map((card) => card.id)]) {
      for (const bucket of OWNER_BUCKETS) await removeFolder(admin, bucket, owner);
      await removeFolder(admin, "exercise-media", `custom/${owner}`);
    }
    const { data: users, error: purgeError } = await admin.rpc("purge_account", { p_user: userId });
    if (purgeError) throw new Error(`purge_account failed: ${purgeError.code}`);
    for (const id of users ?? []) {
      const { error: authError } = await admin.auth.admin.deleteUser(id);
      if (authError && authError.status !== 404) throw new Error(`deleting an auth user failed: ${authError.status ?? "unknown"}`);
    }
    summary.purged += 1;
    if (send && users?.length && profile?.telegram_id && !profile.bot_blocked_at) await sayDeleted(send, profile.telegram_id, locale);
  }
}

/**
 * Health data 30 days after the pd_health consent was withdrawn (право 5; consent-health-data.md 8.3): the progress
 * photo files first, then the rows. A failure leaves the erasure due, so the next run repeats it; both steps are
 * safe to repeat.
 */
async function eraseHealthData(admin: Admin, summary: PrivacySummary, hasTime: () => boolean) {
  const { data, error } = await admin
    .from("health_erasures")
    .select("user_id")
    .is("done_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(10);
  if (error) throw new Error(`reading due health erasures failed: ${error.code}`);
  for (const { user_id: userId } of data) {
    if (!hasTime()) return;
    await removeFolder(admin, PHOTO_BUCKET, userId);
    const { data: erased, error: eraseError } = await admin.rpc("purge_health_data", { p_user: userId });
    if (eraseError) throw new Error(`purge_health_data failed: ${eraseError.code}`);
    if (erased) summary.healthErased += 1;
  }
}

/**
 * Feedback screenshots and certificates past their retention (privacy policy §5.1 rows 9 and 15,
 * 20261021010217_retention.sql): the files go first, then the row, so a failure leaves the row due for the next run.
 */
async function forgetRetainedFiles(admin: Admin, summary: PrivacySummary, hasTime: () => boolean) {
  const { data, error } = await admin.rpc("retention_due_files", { p_limit: 20 });
  if (error) throw new Error(`retention_due_files failed: ${error.code}`);
  for (const row of data) {
    if (!hasTime()) return;
    if (row.paths.length > 0) {
      const { error: removeError } = await admin.storage.from(row.bucket).remove(row.paths);
      if (removeError) throw new Error(`removing from ${row.bucket} failed: ${removeError.name}`);
    }
    const { data: forgotten, error: forgetError } = await admin.rpc("retention_forget", { p_kind: row.kind, p_id: row.id });
    if (forgetError) throw new Error(`retention_forget failed: ${forgetError.code}`);
    if (forgotten) summary.retained += 1;
  }
}

/**
 * CSV copies made for Telegram's download dialog (20261023022417_csv_downloads.sql): 30 minutes after upload,
 * so none outlives an hour with the route every 5 minutes.
 */
async function removeStaleCsv(admin: Admin, summary: PrivacySummary) {
  const { data, error } = await admin.rpc("stale_csv_downloads", { p_limit: 100 });
  if (error) throw new Error(`stale_csv_downloads failed: ${error.code}`);
  if (data.length === 0) return;
  const { error: removeError } = await admin.storage.from(EXPORT_BUCKET).remove(data);
  if (removeError) throw new Error(`removing CSV copies failed: ${removeError.name}`);
  summary.csvRemoved += data.length;
}

/**
 * С5 "удаление выполнено". It cannot go through the outbox: the outbox row belongs to the user, who is gone by
 * now. One attempt, after the account is really deleted; a failure is logged by kind and changes nothing.
 */
async function sayDeleted(send: SendTelegram, chatId: number, locale: Locale) {
  const t = dictionaries[locale].botMessages;
  try {
    const result = await send({ chatId, text: t.deletionDone, silent: false, buttons: [] });
    if (!result.ok) console.error("telling about a done deletion failed", result.kind);
  } catch (cause) {
    console.error("telling about a done deletion failed", cause instanceof Error ? cause.name : "unknown");
  }
}

/**
 * One run of the privacy route: expired archives, due deletions and health data erasures, files past their
 * retention, stale CSV copies, waiting exports, within the time budget. send tells each deleted user that the deletion is done (С5).
 */
export async function runPrivacyJob(
  admin: Admin,
  budgetMs: number,
  send?: SendTelegram,
  now: () => number = Date.now,
): Promise<PrivacySummary> {
  const started = now();
  const hasTime = () => now() - started < budgetMs;
  const summary: PrivacySummary = { expired: 0, built: 0, failed: 0, purged: 0, healthErased: 0, retained: 0, csvRemoved: 0 };
  await expireExports(admin, summary);
  await removeStaleCsv(admin, summary);
  await purgeAccounts(admin, summary, hasTime, send);
  await eraseHealthData(admin, summary, hasTime);
  await forgetRetainedFiles(admin, summary, hasTime);
  await buildExports(admin, summary, hasTime);
  return summary;
}
