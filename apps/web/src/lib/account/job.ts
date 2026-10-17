import "server-only";
import { isLocale, type Locale } from "@/i18n/config";
import { PHOTO_BUCKET } from "@/lib/progress/photos";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildExport, EXPORT_BUCKET, removeFolder } from "./export";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Buckets whose objects sit in a folder named by the owner's id. */
const OWNER_BUCKETS = [PHOTO_BUCKET, "avatars", "certificates", "feedback", EXPORT_BUCKET] as const;

export type PrivacySummary = { expired: number; built: number; failed: number; purged: number };

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
async function purgeAccounts(admin: Admin, summary: PrivacySummary, hasTime: () => boolean) {
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
  }
}

/** One run of the privacy route: expired archives, waiting exports, due deletions, within the time budget. */
export async function runPrivacyJob(admin: Admin, budgetMs: number, now: () => number = Date.now): Promise<PrivacySummary> {
  const started = now();
  const hasTime = () => now() - started < budgetMs;
  const summary: PrivacySummary = { expired: 0, built: 0, failed: 0, purged: 0 };
  await expireExports(admin, summary);
  await purgeAccounts(admin, summary, hasTime);
  await buildExports(admin, summary, hasTime);
  return summary;
}
