import "server-only";

import { displayName, isPairId, PASS_ENDING_DAYS, PASS_ENDING_SESSIONS, type CoachingStatus } from "@/lib/pairs/clients";
import type { PackageAppliesTo } from "@/lib/packages/grid";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import {
  lastValidDay,
  localDay,
  parseFreezePeriod,
  passStatus,
  todayIn,
  type Freeze,
  type ChargeReason,
  type HistoryEntry,
  type PassStatus,
  type PaymentDirection,
  type PaymentMethod,
  type PaymentStatus,
} from "./present";
import type { Debt } from "./debt";
import { loadMoneyChanges } from "./money-changes";
import type { MoneyChange } from "./money-changes-present";

export type { Debt };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const DEFAULT_TIME_ZONE = "Europe/Moscow";

function fail(what: string, error: { code: string } | null): never {
  throw new Error(`loading ${what} failed: ${error?.code}`);
}

/** A pass with its balance, dates in the trainer time zone, payment state, freezes and history. */
export type PassView = {
  id: string;
  coachingId: string;
  title: string;
  sessionsTotal: number;
  remaining: number;
  available: number;
  status: PassStatus;
  priceMinor: number;
  paidMinor: number;
  unpaidMinor: number;
  currency: string;
  startsOn: string;
  /** Last valid day with freezes; null = no expiry. */
  lastDay: string | null;
  /** Last valid day without freezes, what the trainer extends. */
  baseLastDay: string | null;
  freezeDays: number;
  isDropIn: boolean;
  appliesTo: PackageAppliesTo;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  /** Only the grant in the ledger and no payment: the trainer may delete it (R27, PRD 2.8-16). */
  deletable: boolean;
  freezes: Freeze[];
  history: HistoryEntry[];
  /** Who changed the pass, its freezes and payments, and why (PRD wave-1 SCHED-22). */
  changes: MoneyChange[];
};

export type PaymentView = {
  id: string;
  passId: string | null;
  direction: PaymentDirection;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  paidAt: string;
  status: PaymentStatus;
  note: string | null;
  voidReason: string | null;
  /** The client said "Я оплатил"; the trainer confirms or voids it. */
  reported: boolean;
  updatedAt: string;
};


/** {"RUB": 400000} from coaching_balances, numbers only. */
function amounts(value: Json | null | undefined): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

const PASS_COLUMNS =
  "id, coaching_id, title, sessions_total, price_minor, currency, applies_to, is_drop_in, starts_on, expires_at, status, cancel_reason, note, created_at";
const BALANCE_COLUMNS = "pass_id, remaining, available, status, effective_expires_at, freeze_days, paid_minor, unpaid_minor";
const LEDGER_COLUMNS = "id, pass_id, entry_type, related_entry_id, charge_reason, sessions_delta, amount_minor, occurred_at, note";
const PAYMENT_COLUMNS =
  "id, pass_id, direction, amount_minor, currency, method, paid_at, status, note, void_reason, reported_by, client_id, updated_at";

type PaymentRow = {
  id: string;
  pass_id: string | null;
  direction: PaymentDirection;
  amount_minor: number;
  currency: string;
  method: PaymentMethod;
  paid_at: string;
  status: PaymentStatus;
  note: string | null;
  void_reason: string | null;
  reported_by: string | null;
  client_id: string;
  updated_at: string;
};

function paymentView(row: PaymentRow): PaymentView {
  return {
    id: row.id,
    passId: row.pass_id,
    direction: row.direction,
    amountMinor: row.amount_minor,
    currency: row.currency,
    method: row.method,
    paidAt: row.paid_at,
    status: row.status,
    note: row.note,
    voidReason: row.void_reason,
    reported: row.reported_by !== null && row.reported_by === row.client_id,
    updatedAt: row.updated_at,
  };
}

type LedgerRow = { id: string; entry_type: string; related_entry_id: string | null };

/**
 * The charge "Простить" would forgive for this row of a pass: the charge itself while it has no waiver, or the
 * debt charge a settlement covered while that settlement is not reversed (the session then returns here).
 */
function waivableCharge(row: LedgerRow, rows: LedgerRow[]): string | null {
  if (row.entry_type === "charge") {
    return rows.some((other) => other.entry_type === "waiver" && other.related_entry_id === row.id) ? null : row.id;
  }
  if (row.entry_type === "settlement" && row.related_entry_id) {
    const charge = row.related_entry_id;
    return rows.some((other) => other.entry_type === "settlement_reversal" && other.related_entry_id === charge) ? null : charge;
  }
  return null;
}

/** Passes, balances, freezes, ledger and payments of some passes or pairs, read under RLS and put together. */
async function passViews(
  supabase: Supabase,
  filter: { column: "id" | "coaching_id"; values: string[] },
  timeZone: string,
): Promise<{ passes: PassView[]; payments: PaymentView[] }> {
  if (!filter.values.length) return { passes: [], payments: [] };
  const passKey = filter.column === "id" ? "pass_id" : "coaching_id";
  const [passes, balances, ledger, payments] = await Promise.all([
    supabase.from("passes").select(PASS_COLUMNS).in(filter.column, filter.values).order("created_at", { ascending: false }),
    supabase.from("pass_balances").select(BALANCE_COLUMNS).in(passKey, filter.values),
    supabase.from("ledger_entries").select(LEDGER_COLUMNS).in(passKey, filter.values).order("occurred_at", { ascending: false }),
    supabase.from("payments").select(PAYMENT_COLUMNS).in(passKey, filter.values).order("paid_at", { ascending: false }),
  ]);
  for (const [what, result] of Object.entries({ passes, balances, ledger, payments })) {
    if (result.error) fail(what, result.error);
  }
  const ids = (passes.data ?? []).map((pass) => pass.id);
  const freezes = ids.length
    ? await supabase.from("pass_freezes").select("id, pass_id, period, reason").in("pass_id", ids).order("period")
    : { data: [], error: null };
  if (freezes.error) fail("freezes", freezes.error);
  const changes = await loadMoneyChanges(supabase, ids, timeZone);

  const balanceById = new Map((balances.data ?? []).map((row) => [row.pass_id, row]));
  const paymentViews = (payments.data ?? []).map(paymentView);

  const views = (passes.data ?? []).map((pass): PassView => {
    const balance = balanceById.get(pass.id);
    const rows = (ledger.data ?? []).filter((row) => row.pass_id === pass.id);
    return {
      id: pass.id,
      coachingId: pass.coaching_id,
      title: pass.title,
      sessionsTotal: pass.sessions_total,
      remaining: balance?.remaining ?? 0,
      available: balance?.available ?? 0,
      status: passStatus(balance?.status),
      priceMinor: pass.price_minor,
      paidMinor: balance?.paid_minor ?? 0,
      unpaidMinor: balance?.unpaid_minor ?? pass.price_minor,
      currency: pass.currency,
      startsOn: pass.starts_on,
      lastDay: lastValidDay(balance?.effective_expires_at ?? null, timeZone),
      baseLastDay: lastValidDay(pass.expires_at, timeZone),
      freezeDays: balance?.freeze_days ?? 0,
      isDropIn: pass.is_drop_in,
      appliesTo: pass.applies_to,
      note: pass.note,
      cancelReason: pass.cancel_reason,
      createdAt: pass.created_at,
      deletable: rows.every((row) => row.entry_type === "grant") && !paymentViews.some((payment) => payment.passId === pass.id),
      freezes: (freezes.data ?? []).flatMap((row) => {
        const period = row.pass_id === pass.id ? parseFreezePeriod(String(row.period)) : null;
        return period ? [{ id: row.id, ...period, reason: row.reason }] : [];
      }),
      history: rows
        .filter((row) => row.entry_type !== "grant")
        .map((row) => ({
          chargeId: waivableCharge(row, rows),
          id: row.id,
          type: row.entry_type,
          reason: row.charge_reason,
          delta: row.sessions_delta,
          amountMinor: row.amount_minor,
          at: row.occurred_at,
          note: row.note,
        })),
      changes: changes.filter((change) => change.passId === pass.id),
    };
  });
  return { passes: views, payments: paymentViews };
}

/** A live package the trainer can sell from. */
export type SellablePackage = {
  id: string;
  title: string;
  sessionsCount: number;
  priceMinor: number;
  currency: string;
  validityDays: number | null;
  appliesTo: PackageAppliesTo;
};

/** The money of one pair as its trainer sees it (screens.md "Абонементы", "Оплаты"). */
export type PairMoney = {
  coachingId: string;
  status: CoachingStatus;
  clientName: string;
  isCard: boolean;
  /** Dates of passes and freezes are local dates of the trainer time zone. */
  timeZone: string;
  today: string;
  currency: string;
  passes: PassView[];
  payments: PaymentView[];
  debt: Debt;
  /** Sessions that went into debt and are neither forgiven nor covered by a pass, oldest first. */
  debtCharges: DebtCharge[];
  packages: SellablePackage[];
};

export type DebtCharge = {
  id: string;
  reason: ChargeReason | null;
  amountMinor: number;
  currency: string | null;
  at: string;
  note: string | null;
};

/**
 * Debt charges (no pass) without a waiver and without a settlement: the waiver of a debt charge has no pass
 * either, a settlement sits on the pass that covered it, so those are read by the charge ids.
 */
async function openDebtCharges(
  supabase: Supabase,
  rows: { id: string; entry_type: string; charge_reason: ChargeReason | null; amount_minor: number; currency: string | null; occurred_at: string; note: string | null }[],
): Promise<DebtCharge[]> {
  const charges = rows.filter((row) => row.entry_type === "charge");
  if (!charges.length) return [];
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("related_entry_id")
    .in("entry_type", ["waiver", "settlement"])
    .in("related_entry_id", charges.map((row) => row.id));
  if (error) fail("debt charges", error);
  const closed = new Set((data ?? []).map((row) => row.related_entry_id));
  return charges
    .filter((row) => !closed.has(row.id))
    .map((row) => ({ id: row.id, reason: row.charge_reason, amountMinor: row.amount_minor, currency: row.currency, at: row.occurred_at, note: row.note }));
}

/** The pair's money for its signed-in trainer; null without a session or when the pair is not theirs. */
export async function loadPairMoney(coachingId: string): Promise<PairMoney | null> {
  if (!isPairId(coachingId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;

  const { data: pair, error } = await supabase
    .from("coachings")
    .select("id, client_id, status")
    .eq("id", coachingId)
    .eq("trainer_id", userId)
    .maybeSingle();
  if (error) fail("pair", error);
  if (!pair) return null;

  const [me, trainer, person, meta, balance, packages, debtRows] = await Promise.all([
    supabase.from("profiles").select("time_zone").eq("id", userId).maybeSingle(),
    supabase.from("trainer_profiles").select("default_currency").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("first_name, last_name, display_name, username, managed_by_trainer_id").eq("id", pair.client_id).maybeSingle(),
    supabase.from("coaching_trainer_meta").select("client_alias").eq("coaching_id", pair.id).maybeSingle(),
    supabase.from("coaching_balances").select("debt_sessions, debt_amounts").eq("coaching_id", pair.id).maybeSingle(),
    supabase
      .from("packages")
      .select("id, title, sessions_count, price_minor, currency, validity_days, applies_to")
      .eq("trainer_id", userId)
      .is("archived_at", null)
      .order("sessions_count")
      .order("sort_order"),
    supabase
      .from("ledger_entries")
      .select("id, entry_type, related_entry_id, charge_reason, amount_minor, currency, occurred_at, note")
      .eq("coaching_id", pair.id)
      .is("pass_id", null)
      .order("occurred_at"),
  ]);
  for (const [what, result] of Object.entries({ me, trainer, person, meta, balance, packages, debtRows })) {
    if (result.error) fail(what, result.error);
  }
  const timeZone = me.data?.time_zone ?? DEFAULT_TIME_ZONE;
  const { passes, payments } = await passViews(supabase, { column: "coaching_id", values: [pair.id] }, timeZone);
  return {
    coachingId: pair.id,
    status: pair.status,
    clientName: displayName(person.data ?? undefined, meta.data?.client_alias),
    isCard: Boolean(person.data?.managed_by_trainer_id),
    timeZone,
    today: todayIn(timeZone),
    currency: trainer.data?.default_currency ?? "RUB",
    passes,
    payments,
    debt: { sessions: balance.data?.debt_sessions ?? 0, amounts: amounts(balance.data?.debt_amounts) },
    debtCharges: await openDebtCharges(supabase, debtRows.data ?? []),
    packages: (packages.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      sessionsCount: row.sessions_count,
      priceMinor: row.price_minor,
      currency: row.currency,
      validityDays: row.validity_days,
      appliesTo: row.applies_to,
    })),
  };
}

/** A trainer of the signed-in client, with where to pay them (PRD 2.8-15). */
export type ClientTrainerMoney = {
  coachingId: string;
  trainerName: string;
  timeZone: string;
  debt: Debt;
  passes: PassView[];
  paymentLinks: { id: string; title: string; url: string }[];
};

/** Trainer names, time zones and payment links for the client's pairs. */
async function trainersOf(supabase: Supabase, pairs: { id: string; trainer_id: string }[]) {
  const trainerIds = [...new Set(pairs.map((pair) => pair.trainer_id))];
  const [people, links, balances] = await Promise.all([
    supabase.from("public_profiles").select("id, display_name, time_zone").in("id", trainerIds),
    supabase.from("payment_links").select("id, trainer_id, title, url").in("trainer_id", trainerIds).is("archived_at", null).order("sort_order"),
    supabase
      .from("coaching_balances")
      .select("coaching_id, debt_sessions, debt_amounts")
      .in(
        "coaching_id",
        pairs.map((pair) => pair.id),
      ),
  ]);
  for (const [what, result] of Object.entries({ people, links, balances })) {
    if (result.error) fail(what, result.error);
  }
  const personById = new Map((people.data ?? []).map((row) => [row.id, row]));
  const balanceById = new Map((balances.data ?? []).map((row) => [row.coaching_id, row]));
  return (pair: { id: string; trainer_id: string }) => {
    const person = personById.get(pair.trainer_id);
    const balance = balanceById.get(pair.id);
    return {
      trainerName: person?.display_name ?? "",
      timeZone: person?.time_zone ?? DEFAULT_TIME_ZONE,
      debt: { sessions: balance?.debt_sessions ?? 0, amounts: amounts(balance?.debt_amounts) },
      paymentLinks: (links.data ?? []).filter((link) => link.trainer_id === pair.trainer_id).map(({ id, title, url }) => ({ id, title, url })),
    };
  };
}

/**
 * Every pass of the signed-in client by trainer (screens.md "Абонементы"): the pairs with a pass or a debt, in
 * any pair status. Null without a session.
 */
export async function loadClientPasses(): Promise<ClientTrainerMoney[] | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;

  const { data: pairs, error } = await supabase.from("coachings").select("id, trainer_id, started_at").eq("client_id", userId).order("started_at");
  if (error) fail("pairs", error);
  if (!pairs.length) return [];
  const about = await trainersOf(supabase, pairs);

  const groups = await Promise.all(
    pairs.map(async (pair) => {
      const info = about(pair);
      const { passes } = await passViews(supabase, { column: "coaching_id", values: [pair.id] }, info.timeZone);
      return { coachingId: pair.id, ...info, passes };
    }),
  );
  return groups.filter((group) => group.passes.length > 0 || group.debt.sessions > 0);
}

/** One pass of the signed-in client with its payments and where to pay (screens.md "Абонемент"). */
export type ClientPass = ClientTrainerMoney & { pass: PassView; payments: PaymentView[]; today: string };

export async function loadClientPass(passId: string): Promise<ClientPass | null> {
  if (!isPairId(passId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;

  const { data: row, error } = await supabase.from("passes").select("coaching_id, trainer_id").eq("id", passId).eq("client_id", userId).maybeSingle();
  if (error) fail("pass", error);
  if (!row) return null;
  const pair = { id: row.coaching_id, trainer_id: row.trainer_id };
  const info = (await trainersOf(supabase, [pair]))(pair);
  const { passes, payments } = await passViews(supabase, { column: "id", values: [passId] }, info.timeZone);
  const pass = passes[0];
  if (!pass) return null;
  return { coachingId: pair.id, ...info, passes, pass, payments, today: todayIn(info.timeZone) };
}

/** A pair with a debt on the trainer's money screen. */
export type DebtItem = { coachingId: string; name: string; debt: Debt };
/** A payment on the trainer's money screen, with whose it is. */
export type MoneyPayment = PaymentView & { coachingId: string; name: string; passTitle: string | null };
/** A pass that runs out soon: one session left or 7 days to go (К10, Т6). */
export type EndingPass = { id: string; coachingId: string; name: string; title: string; available: number; lastDay: string | null };

export type TrainerMoney = {
  timeZone: string;
  debts: DebtItem[];
  payments: MoneyPayment[];
  ending: EndingPass[];
  /** Confirmed payments of the current month in the trainer time zone, by currency, refunds subtracted. */
  monthIncome: Record<string, number>;
};

const RECENT_PAYMENTS = 50;

/** /trainer/money: debts, payments and ending passes of every client of the signed-in trainer. */
export async function loadTrainerMoney(): Promise<TrainerMoney | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;

  const [me, pairs] = await Promise.all([
    supabase.from("profiles").select("time_zone").eq("id", userId).maybeSingle(),
    supabase.from("coachings").select("id, client_id").eq("trainer_id", userId),
  ]);
  if (me.error) fail("profile", me.error);
  if (pairs.error) fail("pairs", pairs.error);
  const timeZone = me.data?.time_zone ?? DEFAULT_TIME_ZONE;
  const today = todayIn(timeZone);
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
  // A day of slack on each side of the month, then the local date decides.
  const since = new Date(monthStart.getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (!pairs.data.length) return { timeZone, debts: [], payments: [], ending: [], monthIncome: {} };

  const ids = pairs.data.map((pair) => pair.id);
  const [people, meta, balances, payments, month, passes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, first_name, last_name, display_name, username")
      .in(
        "id",
        pairs.data.map((pair) => pair.client_id),
      ),
    supabase.from("coaching_trainer_meta").select("coaching_id, client_alias").in("coaching_id", ids),
    supabase.from("coaching_balances").select("coaching_id, debt_sessions, debt_amounts").eq("trainer_id", userId).gt("debt_sessions", 0),
    supabase
      .from("payments")
      .select(`${PAYMENT_COLUMNS}, coaching_id`)
      .eq("trainer_id", userId)
      .order("paid_at", { ascending: false })
      .limit(RECENT_PAYMENTS),
    supabase.from("payments").select("direction, amount_minor, currency, paid_at").eq("trainer_id", userId).eq("status", "confirmed").gte("paid_at", since),
    supabase
      .from("pass_balances")
      .select("pass_id, coaching_id, title, available, effective_expires_at, status")
      .eq("trainer_id", userId)
      .in("status", ["active", "frozen"]),
  ]);
  for (const [what, result] of Object.entries({ people, meta, balances, payments, month, passes })) {
    if (result.error) fail(what, result.error);
  }

  const personById = new Map((people.data ?? []).map((row) => [row.id, row]));
  const aliasById = new Map((meta.data ?? []).map((row) => [row.coaching_id, row.client_alias]));
  const nameOf = (coachingId: string | null) => {
    const pair = pairs.data.find((candidate) => candidate.id === coachingId);
    return pair ? displayName(personById.get(pair.client_id), aliasById.get(pair.id)) : "";
  };
  const passTitles = new Map((passes.data ?? []).map((row) => [row.pass_id, row.title]));
  const missingTitles = (payments.data ?? []).map((row) => row.pass_id).filter((id): id is string => Boolean(id) && !passTitles.has(id));
  if (missingTitles.length) {
    const { data, error: titlesError } = await supabase.from("passes").select("id, title").in("id", [...new Set(missingTitles)]);
    if (titlesError) fail("pass titles", titlesError);
    for (const row of data ?? []) passTitles.set(row.id, row.title);
  }

  const soon = new Date(Date.now() + PASS_ENDING_DAYS * 24 * 60 * 60 * 1000);
  const monthIncome: Record<string, number> = {};
  for (const row of month.data ?? []) {
    if (localDay(row.paid_at, timeZone).slice(0, 7) !== today.slice(0, 7)) continue;
    monthIncome[row.currency] = (monthIncome[row.currency] ?? 0) + (row.direction === "in" ? row.amount_minor : -row.amount_minor);
  }

  return {
    timeZone,
    debts: (balances.data ?? []).map((row) => ({
      coachingId: row.coaching_id ?? "",
      name: nameOf(row.coaching_id),
      debt: { sessions: row.debt_sessions ?? 0, amounts: amounts(row.debt_amounts) },
    })),
    payments: (payments.data ?? []).map((row) => ({
      ...paymentView(row),
      coachingId: row.coaching_id,
      name: nameOf(row.coaching_id),
      passTitle: row.pass_id ? (passTitles.get(row.pass_id) ?? null) : null,
    })),
    ending: (passes.data ?? [])
      .filter(
        (row) =>
          row.status === "active" &&
          ((row.available ?? 0) <= PASS_ENDING_SESSIONS || (row.effective_expires_at !== null && new Date(row.effective_expires_at) <= soon)),
      )
      .map((row) => ({
        id: row.pass_id ?? "",
        coachingId: row.coaching_id ?? "",
        name: nameOf(row.coaching_id),
        title: row.title ?? "",
        available: row.available ?? 0,
        lastDay: lastValidDay(row.effective_expires_at, timeZone),
      })),
    monthIncome,
  };
}
