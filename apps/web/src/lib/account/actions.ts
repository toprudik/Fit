"use server";

import { refresh } from "next/cache";
import { dictionaries } from "@/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccountActionResult = { ok: true } | { ok: false; reason: "invalid" | "failed" };

function failed(what: string, error: { code?: string }): AccountActionResult {
  console.error(`${what} failed`, error.code ?? "unknown");
  return { ok: false, reason: "failed" };
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * A new token right away, so the proxy sees the deletion mark (or its removal) on the next page load on this
 * device; other devices get it with their next refresh.
 */
async function renewSession(supabase: Supabase) {
  const { error } = await supabase.auth.refreshSession();
  if (error) console.error("refreshing the session failed", error.status ?? "unknown");
}

/** The confirmation word, in either language: the screen shows the one of the current locale. */
function confirmed(word: string): boolean {
  const typed = word.trim().toLocaleUpperCase("ru");
  return Object.values(dictionaries).some((t) => t.account.delete.confirmWord === typed);
}

/** Marks the account for deletion in 30 days (PRIV-7). The database cancels bookings and tells the partners. */
export async function requestAccountDeletion(word: string): Promise<AccountActionResult> {
  if (typeof word !== "string" || !confirmed(word)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return failed("request_account_deletion", error);
  await renewSession(supabase);
  refresh();
  return { ok: true };
}

/** Keeps the account. What the request cancelled stays cancelled (PRD 2.12-7). */
export async function cancelAccountDeletion(): Promise<AccountActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return failed("cancel_account_deletion", error);
  await renewSession(supabase);
  refresh();
  return { ok: true };
}

/** Queues the archive (PRIV-6); a queued, running or fresh one is reused by the database. */
export async function requestDataExport(): Promise<AccountActionResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_data_export");
  if (error) return failed("request_data_export", error);
  refresh();
  return { ok: true };
}
