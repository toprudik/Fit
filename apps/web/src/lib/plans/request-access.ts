"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const input = z.object({
  plan: z.enum(["trainer_pro", "client_premium"]),
  feature: z.string().trim().max(64).optional(),
});

export type RequestAccessResult = { status: "done" | "signed-out" | "failed" };

/**
 * "Запросить доступ" (PLAN-4). request_access returns the earlier request when one is open or was made within
 * a day, so pressing again never makes a duplicate.
 */
export async function requestAccess(raw: { plan: string; feature?: string }): Promise<RequestAccessResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { status: "failed" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_access", { p_plan_code: parsed.data.plan, p_feature: parsed.data.feature });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  if (error.code === "42501" && error.message === "forbidden") return { status: "signed-out" };
  console.error("requesting access failed", error.code);
  return { status: "failed" };
}
