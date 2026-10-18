"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TRAINER_HONORS } from "@/lib/trainer-honors/honors";

const input = z.object({
  trainerId: z.uuid(),
  honor: z.enum(TRAINER_HONORS),
  on: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

export type HonorResult = { status: "done" | "reason-required" | "unchanged" | "failed" };

/**
 * "Выдать" / "Снять" a showcase honor on the user card (ambassador programme §3). admin_set_trainer_honor checks
 * that the caller is an admin and writes the audit log with the reason.
 */
export async function setTrainerHonor(raw: { trainerId: string; honor: string; on: boolean; reason: string }): Promise<HonorResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: raw.reason?.trim() ? "failed" : "reason-required" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_set_trainer_honor", {
    p_trainer_id: parsed.data.trainerId,
    p_honor: parsed.data.honor,
    p_on: parsed.data.on,
    p_reason: parsed.data.reason,
  });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  if (error.message === "honor_unchanged") {
    // Another admin got there first.
    refresh();
    return { status: "unchanged" };
  }
  if (error.message === "reason_required") return { status: "reason-required" };
  console.error("setting a trainer honor failed", error.code);
  return { status: "failed" };
}
