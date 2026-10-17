"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DismissChurnResult = { status: "done" } | { status: "invalid" | "failed" };

/** "Скрыть на 30 дней" in «Под угрозой ухода» (PRD wave-2 §7 rule 6). */
export async function dismissChurn(raw: unknown): Promise<DismissChurnResult> {
  const parsed = z.uuid().safeParse(raw);
  if (!parsed.success) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("trainer_dismiss_churn", { p_coaching_id: parsed.data });
  if (error) {
    console.error("hiding a client from the churn list failed", error.code);
    return { status: "failed" };
  }
  refresh();
  return { status: "done" };
}
