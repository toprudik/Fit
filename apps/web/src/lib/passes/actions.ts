"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  cancelInput,
  correctInput,
  endFreezeInput,
  expiryInput,
  freezeInput,
  invalidFields,
  recordInput,
  reportInput,
  sellInput,
  voidInput,
  adjustInput,
  pastSessionInput,
  waiveInput,
  type AdjustInput,
  type CancelInput,
  type CorrectInput,
  type PastSessionInput,
  type WaiveInput,
  type EndFreezeInput,
  type ExpiryInput,
  type FreezeInput,
  type RecordInput,
  type ReportInput,
  type SellInput,
  type VoidInput,
} from "./input";
import { addDays, freezePeriod, localDay, localInstant, paidAtFor } from "./present";

/**
 * Writes on passes, freezes and payments (PRD wave-1 §2.8). Every write goes through the user's client, so the
 * policies and RPC checks of the database decide; these actions only shape the input and name the outcome.
 */
export type MoneyResult =
  | { status: "done" }
  | { status: "invalid"; fields: string[] }
  /** The row changed or is gone since the screen loaded (a client edited the report, a freeze started). */
  | { status: "stale" }
  /** A reason in the database's words: ended pair, overlapping freeze, pass in use ... */
  | { status: "refused"; reason: "ended" | "overlap" | "in-use" | "cancelled" | "range" | "waived" | "overdrawn" | "not-past" }
  | { status: "failed" };

export type SellResult = { status: "sold"; passId: string; settled: number } | Exclude<MoneyResult, { status: "done" }>;

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** The signed-in user's id and time zone (the trainer's for pass dates), or null. */
async function me(supabase: Supabase): Promise<{ id: string; timeZone: string } | null> {
  const { data: session } = await supabase.auth.getClaims();
  const id = session?.claims.sub;
  if (!id) return null;
  const { data } = await supabase.from("profiles").select("time_zone").eq("id", id).maybeSingle();
  return { id, timeZone: data?.time_zone ?? "Europe/Moscow" };
}

function failed(what: string, error: { code?: string; message?: string } | null): MoneyResult {
  console.error(`${what} failed`, error?.code, error?.code === "P0001" ? error.message : "");
  return { status: "failed" };
}

/** "Оформить абонемент": the pass, its grant, the debt it settles and the payment, in one RPC. */
export async function sellPass(input: SellInput): Promise<SellResult> {
  const parsed = sellInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const { coachingId, startsOn, note, source, payment, requestId } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const user = await me(supabase);
  if (!user) return { status: "failed" };

  let currency: string | undefined;
  if (source.kind === "custom") {
    const { data } = await supabase.from("trainer_profiles").select("default_currency").eq("user_id", user.id).maybeSingle();
    if (!data) return { status: "failed" };
    currency = data.default_currency;
  }
  const { data, error } = await supabase.rpc("create_pass", {
    p_coaching_id: coachingId,
    p_starts_on: startsOn,
    p_note: note ?? undefined,
    p_request_id: requestId,
    ...(source.kind === "package"
      ? { p_package_id: source.packageId }
      : {
          p_title: source.title,
          p_sessions: source.sessions,
          p_price_minor: source.price,
          p_currency: currency,
          p_validity_days: source.validity ?? undefined,
          p_applies_to: source.appliesTo,
        }),
    ...(payment
      ? { p_payment_minor: payment.amount, p_payment_method: payment.method, p_paid_at: paidAtFor(payment.paidOn, user.timeZone) }
      : {}),
  });
  const sold = data?.[0];
  if (error || !sold) {
    if (error?.message === "coaching_ended") return { status: "refused", reason: "ended" };
    if (error?.message === "request_reused") return { status: "stale" };
    if (error?.message === "pass_invalid" || error?.message === "package_not_found") return { status: "invalid", fields: ["source"] };
    return failed("selling a pass", error) as SellResult;
  }
  refresh();
  return { status: "sold", passId: sold.pass_id, settled: sold.settled };
}

/** "Аннулировать": the rest of the sessions leave with a refund row, history and payments stay (MONEY-10). */
export async function cancelPass(input: CancelInput): Promise<MoneyResult> {
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_pass", { p_pass_id: parsed.data.passId, p_reason: parsed.data.reason });
  if (error) return failed("cancelling a pass", error);
  refresh();
  return { status: "done" };
}

/** "Удалить": only a pass with nothing but its grant and no payments (R27); otherwise it is cancelled. */
export async function deletePass(passId: string): Promise<MoneyResult> {
  if (!z.uuid().safeParse(passId).success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("passes").delete().eq("id", passId).select("id");
  if (error?.message === "pass_in_use") return { status: "refused", reason: "in-use" };
  if (error) return failed("deleting a pass", error);
  if (data.length !== 1) return { status: "stale" };
  refresh();
  return { status: "done" };
}

/** "Изменить срок": a new last day (or none) with a reason; an expired pass works again (MONEY-5). */
export async function changeExpiry(input: ExpiryInput): Promise<MoneyResult> {
  const parsed = expiryInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("change_pass_expiry", {
    p_pass_id: parsed.data.passId,
    // null removes the expiry; the generated type does not know the argument may be null.
    p_last_day: parsed.data.lastDay as string,
    p_reason: parsed.data.reason,
  });
  if (error?.message === "invalid_range") return { status: "refused", reason: "range" };
  if (error?.message === "pass_cancelled") return { status: "refused", reason: "cancelled" };
  if (error) return failed("changing a pass expiry", error);
  refresh();
  return { status: "done" };
}

/** "Заморозить": each frozen day moves the end of the pass by a day (PRD 2.8-14, MONEY-6). */
export async function addFreeze(input: FreezeInput): Promise<MoneyResult> {
  const parsed = freezeInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const { passId, from, to, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("pass_freezes").insert({ pass_id: passId, period: freezePeriod(from, to), reason }).select("id");
  // 23P01: the exclusion constraint, another freeze of the pass covers some of these days.
  if (error?.code === "23P01") return { status: "refused", reason: "overlap" };
  if (error || data.length !== 1) return failed("adding a freeze", error);
  refresh();
  return { status: "done" };
}

/** "Снять заморозку" of a running freeze: it ends on the given day (today at the earliest), the past stays. */
export async function endFreeze(input: EndFreezeInput): Promise<MoneyResult> {
  const parsed = endFreezeInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { data: row, error: readError } = await supabase.from("pass_freezes").select("period").eq("id", parsed.data.freezeId).maybeSingle();
  if (readError) return failed("reading a freeze", readError);
  const first = row ? /^\[(\d{4}-\d{2}-\d{2}),/.exec(String(row.period))?.[1] : undefined;
  if (!first) return { status: "stale" };
  if (parsed.data.lastDay < first) return { status: "refused", reason: "range" };
  const { data, error } = await supabase
    .from("pass_freezes")
    .update({ period: `[${first},${addDays(parsed.data.lastDay, 1)})` })
    .eq("id", parsed.data.freezeId)
    .select("id");
  if (error?.code === "42501") return { status: "refused", reason: "range" };
  if (error) return failed("ending a freeze", error);
  if (data.length !== 1) return { status: "stale" };
  refresh();
  return { status: "done" };
}

/** "Убрать" a freeze that has not started; a started one is ended instead. */
export async function removeFreeze(freezeId: string): Promise<MoneyResult> {
  if (!z.uuid().safeParse(freezeId).success) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("pass_freezes").delete().eq("id", freezeId).select("id");
  if (error) return failed("removing a freeze", error);
  if (data.length !== 1) return { status: "stale" };
  refresh();
  return { status: "done" };
}

/** The pass's currency, or the trainer's default for money on account. */
async function currencyFor(supabase: Supabase, passId: string | null, trainerId: string): Promise<string | null> {
  if (passId) {
    const { data } = await supabase.from("passes").select("currency").eq("id", passId).maybeSingle();
    return data?.currency ?? null;
  }
  const { data } = await supabase.from("trainer_profiles").select("default_currency").eq("user_id", trainerId).maybeSingle();
  return data?.default_currency ?? null;
}

/** "Отметить оплату" by the trainer: confirmed at once, for a pass or on account; also a refund. */
export async function recordPayment(input: RecordInput): Promise<MoneyResult> {
  const parsed = recordInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const { coachingId, passId, direction, payment, note } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const user = await me(supabase);
  if (!user) return { status: "failed" };
  const [currency, pair] = await Promise.all([
    currencyFor(supabase, passId, user.id),
    supabase.from("coachings").select("client_id").eq("id", coachingId).eq("trainer_id", user.id).maybeSingle(),
  ]);
  if (!currency || !pair.data) return { status: "stale" };
  const { error } = await supabase.from("payments").insert({
    coaching_id: coachingId,
    trainer_id: user.id,
    client_id: pair.data.client_id,
    pass_id: passId,
    direction,
    amount_minor: payment.amount,
    currency,
    method: payment.method,
    paid_at: paidAtFor(payment.paidOn, user.timeZone),
    status: "confirmed",
    note,
  });
  if (error) return failed("recording a payment", error);
  refresh();
  return { status: "done" };
}

/**
 * "Подтвердить" a payment the client reported. Conditional on the version the trainer saw: if the client changed
 * the report meanwhile, nothing is confirmed and the screen reloads it (payments_guard_columns note).
 */
export async function confirmPayment(paymentId: string, seenUpdatedAt: string): Promise<MoneyResult> {
  if (!z.uuid().safeParse(paymentId).success || !seenUpdatedAt) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "confirmed" })
    .eq("id", paymentId)
    .eq("status", "reported")
    .eq("updated_at", seenUpdatedAt)
    .select("id");
  if (error) return failed("confirming a payment", error);
  if (data.length !== 1) {
    refresh();
    return { status: "stale" };
  }
  refresh();
  return { status: "done" };
}

/**
 * "Исправить" a confirmed payment: correct_payment voids it with the reason and enters the corrected one in
 * the same transaction, so the pass never counts it twice or not at all.
 */
export async function correctPayment(input: CorrectInput): Promise<MoneyResult> {
  const parsed = correctInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const { paymentId, payment, reason } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const user = await me(supabase);
  if (!user) return { status: "failed" };
  // The same day keeps the time it was entered with, so the corrected payment stays where it was in the list.
  const { data: old } = await supabase.from("payments").select("paid_at").eq("id", paymentId).maybeSingle();
  if (!old) return { status: "stale" };
  const { error } = await supabase.rpc("correct_payment", {
    p_payment_id: paymentId,
    p_amount_minor: payment.amount,
    p_method: payment.method,
    p_paid_at: localDay(old.paid_at, user.timeZone) === payment.paidOn ? old.paid_at : paidAtFor(payment.paidOn, user.timeZone),
    p_reason: reason,
  });
  if (error?.code === "P0002") return { status: "stale" };
  if (error) return failed("correcting a payment", error);
  refresh();
  return { status: "done" };
}

/** "Аннулировать" a payment: it stays in the history with the reason and stops counting (R26). */
export async function voidPayment(input: VoidInput): Promise<MoneyResult> {
  const parsed = voidInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "voided", void_reason: parsed.data.reason })
    .eq("id", parsed.data.paymentId)
    .neq("status", "voided")
    .select("id");
  if (error) return failed("voiding a payment", error);
  if (data.length !== 1) return { status: "stale" };
  refresh();
  return { status: "done" };
}

/**
 * "Я оплатил": the client tells the trainer; the balance moves only when the trainer confirms. While one report on the
 * pass waits, the database refuses another (QA B1): "already" asks the client to wait or withdraw the first one.
 */
export async function reportPayment(input: ReportInput): Promise<MoneyResult | { status: "already" }> {
  const parsed = reportInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const { passId, payment, note } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const user = await me(supabase);
  if (!user) return { status: "failed" };
  const { data: pass } = await supabase
    .from("passes")
    .select("coaching_id, trainer_id, currency")
    .eq("id", passId)
    .eq("client_id", user.id)
    .maybeSingle();
  if (!pass) return { status: "stale" };
  const { data: trainer } = await supabase.from("public_profiles").select("time_zone").eq("id", pass.trainer_id).maybeSingle();
  const { error } = await supabase.from("payments").insert({
    coaching_id: pass.coaching_id,
    trainer_id: pass.trainer_id,
    client_id: user.id,
    pass_id: passId,
    direction: "in",
    amount_minor: payment.amount,
    currency: pass.currency,
    method: payment.method,
    paid_at: paidAtFor(payment.paidOn, trainer?.time_zone ?? user.timeZone),
    status: "reported",
    note,
  });
  if (error?.code === "P0001" && error.message === "payment_already_reported") return { status: "already" };
  if (error) return failed("reporting a payment", error);
  refresh();
  return { status: "done" };
}

/** "Отозвать" own report before the trainer confirms it. */
export async function withdrawReport(input: VoidInput): Promise<MoneyResult> {
  const parsed = voidInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "voided", void_reason: parsed.data.reason })
    .eq("id", parsed.data.paymentId)
    .eq("status", "reported")
    .select("id");
  if (error) return failed("withdrawing a report", error);
  if (data.length !== 1) return { status: "stale" };
  refresh();
  return { status: "done" };
}

/** "Простить" a charge (PRD 2.6.6-4): the session returns to its pass, or the debt shrinks. Final. */
export async function waiveCharge(input: WaiveInput): Promise<MoneyResult> {
  const parsed = waiveInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("waive_charge", {
    p_charge_id: parsed.data.chargeId,
    ...(parsed.data.reason ? { p_reason: parsed.data.reason } : {}),
  });
  if (error?.message === "already_waived") return { status: "refused", reason: "waived" };
  if (error?.message === "charge_not_found") return { status: "stale" };
  if (error) return failed("waiving a charge", error);
  refresh();
  return { status: "done" };
}

/** "Корректировка": plus or minus sessions on a pass with a note (R84); never below zero. */
export async function adjustPass(input: AdjustInput): Promise<MoneyResult> {
  const parsed = adjustInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("adjust_pass", {
    p_pass_id: parsed.data.passId,
    p_delta: parsed.data.delta,
    p_note: parsed.data.note,
  });
  if (error?.message === "pass_overdrawn") return { status: "refused", reason: "overdrawn" };
  if (error?.message === "pass_not_found") return { status: "stale" };
  if (error) return failed("adjusting a pass", error);
  refresh();
  return { status: "done" };
}

/** "Дозаписать занятие": a personal session that already ended, charged by the usual rules (PRD 2.6.2-7). */
export async function recordPastSession(input: PastSessionInput): Promise<MoneyResult> {
  const parsed = pastSessionInput.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: invalidFields(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const user = await me(supabase);
  if (!user) return { status: "failed" };
  const { error } = await supabase.rpc("record_past_session", {
    p_coaching_id: parsed.data.coachingId,
    p_starts_at: localInstant(parsed.data.day, parsed.data.time, user.timeZone),
    p_duration_min: parsed.data.durationMin,
    p_mode: "offline",
    p_status: parsed.data.status,
  });
  if (error?.message === "not_past" || error?.message === "too_old") return { status: "refused", reason: "not-past" };
  if (error?.message === "not_your_client") return { status: "refused", reason: "ended" };
  if (error) return failed("recording a past session", error);
  refresh();
  return { status: "done" };
}
