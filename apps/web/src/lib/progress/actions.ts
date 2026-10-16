"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isDay, paidAtFor, todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMeasurementKind, isValidMetric, type MeasurementKind } from "./measurements";

export type ProgressActionResult = { ok: true } | { ok: false; reason: "invalid" | "failed" };

const isId = (value: unknown) => z.uuid().safeParse(value).success;

function failed(what: string, error: { code: string }): ProgressActionResult {
  console.error(`${what} failed`, error.code);
  return { ok: false, reason: "failed" };
}

type Values = { kind: MeasurementKind; value: number }[];

function validValues(values: unknown): values is Values {
  if (!Array.isArray(values) || values.length === 0 || values.length > 9) return false;
  const kinds = new Set<string>();
  for (const item of values) {
    if (!item || typeof item !== "object") return false;
    const { kind, value } = item as { kind: unknown; value: unknown };
    if (!isMeasurementKind(kind) || typeof value !== "number" || !isValidMetric(kind, value) || kinds.has(kind)) return false;
    kinds.add(kind);
  }
  return true;
}

/**
 * Weight and girths on one date, in kg and cm (PRD wave-1 §2.11-1). Without `coachingId` the client enters own
 * values; with it the pair's trainer enters them for the client, which RLS allows only while that client shares
 * measurements. The author is stamped by the database. The date is the entering user's local day: now for
 * today, noon of that day otherwise.
 */
export async function addMeasurements(input: { coachingId?: string; date: string; values: Values }): Promise<ProgressActionResult> {
  if (!isDay(input.date) || !validValues(input.values)) return { ok: false, reason: "invalid" };
  if (input.coachingId !== undefined && !isId(input.coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { ok: false, reason: "invalid" };
  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle();
  const timeZone = settings?.time_zone ?? "Europe/Moscow";
  if (input.date > todayIn(timeZone) || input.date < "1900-01-01") return { ok: false, reason: "invalid" };

  let clientId = userId;
  if (input.coachingId) {
    const { data: pair, error } = await supabase.from("coachings").select("client_id, trainer_id").eq("id", input.coachingId).maybeSingle();
    if (error) return failed("loading the pair", error);
    if (!pair || pair.trainer_id !== userId) return { ok: false, reason: "invalid" };
    clientId = pair.client_id;
  }
  const measuredAt = paidAtFor(input.date, timeZone);
  const { error } = await supabase.from("measurements").insert(
    input.values.map(({ kind, value }) => ({ client_id: clientId, kind, value, measured_at: measuredAt, local_date: input.date })),
  );
  // 42501: the client closed measurements to this trainer, or the pair has ended.
  if (error) return error.code === "42501" ? { ok: false, reason: "invalid" } : failed("adding measurements", error);
  refresh();
  return { ok: true };
}

/** Changes the value of the caller's own entry; RLS refuses anyone else's (PROG-1). */
export async function updateMeasurement(input: { id: string; kind: MeasurementKind; value: number }): Promise<ProgressActionResult> {
  if (!isId(input.id) || !isMeasurementKind(input.kind) || !isValidMetric(input.kind, input.value)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("measurements").update({ value: input.value }).eq("id", input.id).select("id");
  if (error) return failed("updating a measurement", error);
  if (data.length === 0) return { ok: false, reason: "invalid" };
  refresh();
  return { ok: true };
}

export async function deleteMeasurement(id: string): Promise<ProgressActionResult> {
  if (!isId(id)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("measurements").delete().eq("id", id).select("id");
  if (error) return failed("deleting a measurement", error);
  if (data.length === 0) return { ok: false, reason: "invalid" };
  refresh();
  return { ok: true };
}
