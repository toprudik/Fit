"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AnnounceDocumentsResult = { status: "done"; queued: number } | { status: "invalid-date" | "date-not-ahead" | "failed" };

/**
 * «Объявить новые редакции документов» on the admin overview (право 15): announce_documents_update checks the admin,
 * that the day is after today in Moscow, queues the bot message for everyone with an account and audits it. Queued is
 * 0 when that day was announced already.
 */
export async function announceDocumentsUpdate(raw: string): Promise<AnnounceDocumentsResult> {
  // A real calendar day: 2026-02-31 does not survive the round trip.
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || !date.toISOString().startsWith(raw)) return { status: "invalid-date" };
  const day = raw;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("announce_documents_update", { p_effective_on: day });
  if (!error) return { status: "done", queued: data ?? 0 };
  if (error.message === "date_not_ahead") return { status: "date-not-ahead" };
  console.error("announcing new document versions failed", error.code);
  return { status: "failed" };
}
