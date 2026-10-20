"use server";

import { z } from "zod";
import { isLocale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CLIENT_COUNTS, WAITLIST_CONSENT_VERSION } from "./waitlist";

export type WaitlistError = "invalid" | "consent" | "busy" | "failed";
export type WaitlistState = { status: "idle" } | { status: "done" } | { status: "error"; error: WaitlistError };

const input = z.object({
  name: z.string().trim().min(1).max(80),
  contact: z.string().trim().max(120),
  clients: z.enum(CLIENT_COUNTS).nullable(),
  source: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).nullable(),
});

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

/**
 * «Записаться» in the waitlist of /for-trainers (marketing backlog item 10). Signed in, the entry is the
 * account's and a contact is optional; signed out, a contact is required. The consent box must be ticked.
 * A filled `website` field is a bot: it is told the entry went through and nothing is written.
 */
export async function joinWaitlist(_previous: WaitlistState, formData: FormData): Promise<WaitlistState> {
  if (text(formData.get("website"))) return { status: "done" };
  if (formData.get("consent") !== "on") return { status: "error", error: "consent" };
  const locale = text(formData.get("locale"));
  const parsed = input.safeParse({
    name: text(formData.get("name")),
    contact: text(formData.get("contact")),
    clients: text(formData.get("clients")) || null,
    source: text(formData.get("source")) || null,
  });
  if (!parsed.success || !isLocale(locale)) return { status: "error", error: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const contact = parsed.data.contact || undefined;
  // Signed out, the contact is the only way to reach the trainer; signed in, Telegram is.
  if (contact ? contact.length < 3 : !session?.claims.sub) return { status: "error", error: "invalid" };

  const { error } = await supabase.rpc("join_trainer_waitlist", {
    p_name: parsed.data.name,
    p_locale: locale,
    p_consent_version: WAITLIST_CONSENT_VERSION,
    p_contact: contact,
    p_clients: parsed.data.clients ?? undefined,
    p_source: parsed.data.source ?? undefined,
  });
  if (error) {
    if (error.message === "waitlist_busy") return { status: "error", error: "busy" };
    if (error.message === "waitlist_invalid") return { status: "error", error: "invalid" };
    console.error("joining the trainer waitlist failed", error.code);
    return { status: "error", error: "failed" };
  }
  return { status: "done" };
}
