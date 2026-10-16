"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TRIAL_DURATIONS, TRIAL_MAX_PRICE } from "./link";

/** What was typed, so the form shows it again after React resets it on submit. */
export type TrialLinkValues = Record<string, string>;

export type CreateTrialLinkState =
  | { status: "idle" }
  | { status: "created" }
  | { status: "invalid"; fields: string[]; values: TrialLinkValues }
  | { status: "failed"; values: TrialLinkValues };

const input = z.object({
  title: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
  duration: z.coerce
    .number()
    .int()
    .refine((value) => (TRIAL_DURATIONS as readonly number[]).includes(value)),
  // Typed in major units with a comma or a dot; stored in minor units.
  price: z
    .string()
    .trim()
    .transform((value) => Number((value || "0").replace(/\s/g, "").replace(",", ".")))
    .refine((value) => Number.isFinite(value) && value >= 0 && value <= TRIAL_MAX_PRICE),
  mode: z.enum(["offline", "online"]),
  location: z
    .string()
    .transform((value) => value || null)
    .refine((value) => value === null || z.uuid().safeParse(value).success),
});

/** "Создать ссылку" on /trainer/links: a trial link in the trainer's default currency. */
export async function createTrialLink(_previous: CreateTrialLinkState, formData: FormData): Promise<CreateTrialLinkState> {
  const values = Object.fromEntries(
    ["title", "description", "duration", "price", "mode", "location"].map((name) => [name, String(formData.get(name) ?? "")]),
  );
  const parsed = input.safeParse(values);
  if (!parsed.success) {
    return { status: "invalid", fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))], values };
  }

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { status: "failed", values };
  const { data: trainer, error: trainerError } = await supabase
    .from("trainer_profiles")
    .select("default_currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (trainerError || !trainer) {
    if (trainerError) console.error("loading the trainer currency failed", trainerError.code);
    return { status: "failed", values };
  }

  const link = parsed.data;
  const { error } = await supabase.from("trial_links").insert({
    trainer_id: userId,
    title: link.title,
    description: link.description,
    duration_min: link.duration,
    price_minor: Math.round(link.price * 100),
    currency: trainer.default_currency,
    // An online trial has no place.
    location_id: link.mode === "online" ? null : link.location,
    mode: link.mode,
  });
  if (error) {
    console.error("creating a trial link failed", error.code);
    return { status: "failed", values };
  }
  refresh();
  return { status: "created" };
}

export type TrialLinkActionResult = { failed: boolean };

/** "Выключить" / "Включить": the token stays, so a shared QR works again once the link is back on. */
export async function setTrialLinkEnabled(id: string, enabled: boolean): Promise<TrialLinkActionResult> {
  if (!z.uuid().safeParse(id).success || typeof enabled !== "boolean") return { failed: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("trial_links").update({ is_enabled: enabled }).eq("id", id).select("id");
  if (error || data.length !== 1) {
    console.error("switching a trial link failed", error?.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}

/** "Удалить": archiving is final (the database keeps an archived link archived). */
export async function archiveTrialLink(id: string): Promise<TrialLinkActionResult> {
  if (!z.uuid().safeParse(id).success) return { failed: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trial_links")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error || data.length !== 1) {
    console.error("deleting a trial link failed", error?.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
