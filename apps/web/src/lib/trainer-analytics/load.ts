import "server-only";
import { displayName } from "@/lib/pairs/clients";
import { PAID_PLAN, requestedPlans } from "@/lib/plans/plans";
import { clientNames, loadScheduleOwner } from "@/lib/schedule/load";
import { today } from "@/lib/schedule/time";
import { periodRange, previousPeriod, simulatorBase, type Period, type PeriodKind } from "./period";

type Owner = NonNullable<Awaited<ReturnType<typeof loadScheduleOwner>>>;

function fail(what: string, error: { code?: string }): never {
  throw new Error(`loading the trainer ${what} failed: ${error.code}`);
}

/** Which blocks the trainer's plan opens (PRD wave-2 §7 is Pro: analytics, finance, CSV). */
export type AnalyticsAccess = { analytics: boolean; finance: boolean; export: boolean; requested: boolean };

async function loadAccess(owner: Owner): Promise<AnalyticsAccess> {
  const ask = (feature: string) => owner.supabase.rpc("has_entitlement", { p_user: owner.userId, p_feature: feature });
  const [analytics, finance, csv, requests] = await Promise.all([
    ask("trainer.analytics"),
    ask("trainer.finance"),
    ask("trainer.export"),
    owner.supabase.from("access_requests").select("plan_code, status, created_at").eq("user_id", owner.userId),
  ]);
  if (analytics.error) fail("plan", analytics.error);
  if (finance.error) fail("plan", finance.error);
  if (csv.error) fail("plan", csv.error);
  if (requests.error) fail("access requests", requests.error);
  return {
    analytics: analytics.data === true,
    finance: finance.data === true,
    export: csv.data === true,
    requested: requestedPlans(requests.data).has(PAID_PLAN.trainer),
  };
}

async function summary(owner: Owner, period: Period) {
  const { data, error } = await owner.supabase.rpc("trainer_analytics", { p_from: period.from, p_to: period.to }).single();
  if (error) fail("analytics", error);
  return { ...data, debt: data.debt as Record<string, number> };
}

async function finance(owner: Owner, period: Period) {
  const { data, error } = await owner.supabase.rpc("trainer_finance", { p_from: period.from, p_to: period.to });
  if (error) fail("finance", error);
  return data;
}

export type FinanceRow = Awaited<ReturnType<typeof finance>>[number];

async function ending(owner: Owner) {
  const { data, error } = await owner.supabase.rpc("trainer_ending_passes");
  if (error) fail("ending passes", error);
  return data.map((row) => ({ ...row, name: displayName(row, row.client_alias) }));
}

async function churn(owner: Owner) {
  const { data, error } = await owner.supabase.rpc("trainer_churn_risk");
  if (error) fail("churn list", error);
  return data.map((row) => ({ ...row, name: displayName(row, row.client_alias) }));
}

/** «Прогресс» (§7): per client, how each measured kind moved over the period, weight first. */
async function progress(owner: Owner, period: Period) {
  const { data, error } = await owner.supabase.rpc("trainer_progress", { p_from: period.from, p_to: period.to });
  if (error) fail("progress", error);
  const names = await clientNames(owner.supabase, data.map((row) => row.coaching_id));
  const byPair = new Map<string, { coachingId: string; name: string; changes: { kind: (typeof data)[number]["kind"]; first: number; last: number }[] }>();
  for (const row of data) {
    const entry = byPair.get(row.coaching_id) ?? { coachingId: row.coaching_id, name: names.get(row.coaching_id) ?? "", changes: [] };
    entry.changes.push({ kind: row.kind, first: Number(row.first_value), last: Number(row.last_value) });
    byPair.set(row.coaching_id, entry);
  }
  return [...byPair.values()]
    .map((entry) => ({ ...entry, changes: entry.changes.sort((a, b) => Number(b.kind === "weight") - Number(a.kind === "weight")) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ClientProgress = Awaited<ReturnType<typeof progress>>[number];

async function hints(owner: Owner) {
  const { data, error } = await owner.supabase.rpc("trainer_price_hints");
  if (error) fail("price hints", error);
  return data;
}

export type PriceHint = Awaited<ReturnType<typeof hints>>[number];

/** Everything «Аналитика» shows for a period; null when nobody is signed in. Locked blocks come back empty. */
export async function loadTrainerAnalytics(kind: PeriodKind, offset: number) {
  const owner = await loadScheduleOwner();
  if (!owner) return null;
  const access = await loadAccess(owner);
  const day = today(owner.timeZone);
  const period = periodRange(kind, day, offset);
  const previous = previousPeriod(kind, period);
  const base = { timeZone: owner.timeZone, access, period, previous, isCurrent: offset === 0 };
  if (!access.analytics) return { ...base, data: null };

  const [current, before, endingPasses, atRisk, clientsProgress, money] = await Promise.all([
    summary(owner, period),
    summary(owner, previous),
    ending(owner),
    churn(owner),
    progress(owner, period),
    access.finance
      ? Promise.all([finance(owner, period), finance(owner, previous), finance(owner, simulatorBase(day)), hints(owner)])
      : null,
  ]);
  return {
    ...base,
    data: {
      current,
      before,
      ending: endingPasses,
      churn: atRisk,
      progress: clientsProgress,
      finance: money ? { current: money[0], before: money[1], base: money[2], hints: money[3] } : null,
    },
  };
}

export type TrainerAnalytics = NonNullable<Awaited<ReturnType<typeof loadTrainerAnalytics>>>;
