import { lastValidDay } from "@/lib/passes/present";
import type { Database } from "@/lib/supabase/database.types";

export type MoneyAction = Database["public"]["Enums"]["money_event_action"];
type ActorRole = Database["public"]["Enums"]["actor_role"];

/** One field a change touched, as the history shows it; days are "YYYY-MM-DD" in the trainer's zone. */
export type MoneyDetail =
  | { kind: "expires"; from: string | null; to: string | null }
  | { kind: "title"; to: string }
  | { kind: "sessions"; from: number; to: number }
  | { kind: "amount"; minor: number; currency: string }
  | { kind: "note" };

/** A money_events row for «Изменения абонемента» (PRD wave-1 SCHED-22): who changed what, when and why. */
export type MoneyChange = {
  id: number;
  passId: string | null;
  action: MoneyAction;
  details: MoneyDetail[];
  role: ActorRole;
  actor: string | null;
  at: string;
  reason: string | null;
};

type Values = Record<string, unknown> | null;

function has(values: Values, key: string): boolean {
  return values !== null && key in values;
}

/** The fields worth naming: a new expiry, title or size of a pass, the sum of a payment, a changed note. */
export function moneyDetails(action: MoneyAction, oldValues: Values, newValues: Values, timeZone: string): MoneyDetail[] {
  const details: MoneyDetail[] = [];
  if (action === "pass_changed") {
    if (has(newValues, "expires_at")) {
      const day = (values: Values) => lastValidDay(typeof values?.expires_at === "string" ? values.expires_at : null, timeZone);
      details.push({ kind: "expires", from: day(oldValues), to: day(newValues) });
    }
    if (typeof newValues?.title === "string") details.push({ kind: "title", to: newValues.title });
    if (typeof oldValues?.sessions_total === "number" && typeof newValues?.sessions_total === "number") {
      details.push({ kind: "sessions", from: oldValues.sessions_total, to: newValues.sessions_total });
    }
  }
  if (action.startsWith("payment_")) {
    const amount = newValues?.amount_minor ?? oldValues?.amount_minor;
    const currency = newValues?.currency ?? oldValues?.currency;
    if ((action === "payment_created" || has(newValues, "amount_minor")) && typeof amount === "number" && typeof currency === "string") {
      details.push({ kind: "amount", minor: amount, currency });
    }
  }
  if (action !== "pass_created" && action !== "payment_created" && has(newValues, "note")) details.push({ kind: "note" });
  return details;
}
