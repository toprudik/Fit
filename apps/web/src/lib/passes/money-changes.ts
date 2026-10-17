import "server-only";
import { displayName } from "@/lib/pairs/clients";
import { moneyDetails, type MoneyChange } from "@/lib/passes/money-changes-present";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function values(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Changes of some passes, their freezes and payments (PRD wave-1 SCHED-22), oldest first. money_events is readable
 * by the client and the pair's trainer (a payment row by the payments scope), so each viewer gets what RLS allows.
 */
export async function loadMoneyChanges(supabase: Supabase, passIds: string[], timeZone: string): Promise<MoneyChange[]> {
  if (passIds.length === 0) return [];
  const { data, error } = await supabase
    .from("money_events")
    .select("id, pass_id, action, actor_id, actor_role, reason, old_values, new_values, created_at")
    .in("pass_id", passIds)
    .order("id");
  if (error) throw new Error(`loading money changes failed: ${error.code}`);

  const actorIds = [...new Set(data.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))];
  const people = actorIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name, display_name, username").in("id", actorIds)
    : { data: [] };
  const names = new Map((people.data ?? []).map((person) => [person.id, displayName(person)]));

  return data.map((row) => ({
    id: row.id,
    passId: row.pass_id,
    action: row.action,
    details: moneyDetails(row.action, values(row.old_values), values(row.new_values), timeZone),
    role: row.actor_role,
    actor: (row.actor_id && names.get(row.actor_id)) || null,
    at: row.created_at,
    reason: row.reason,
  }));
}
