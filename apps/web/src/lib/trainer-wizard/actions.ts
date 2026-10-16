"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CANCELLATION_HOURS, CURRENCIES, isSpecialty, isTimeZone, PAYMENT_LINK_KINDS } from "./options";
import { ensureClientInvite } from "./client-link";
import { isWizardStep, nextPath, type WizardStep } from "./steps";

/** What was typed, so the form shows it again after React resets it on submit. */
export type WizardValues = Record<string, string | string[]>;

/**
 * What a step's form shows after "Далее": `invalid` names the fields to fix, `added` clears the form
 * after "Добавить ещё", `failed` is anything the database refused. Success moves to the next screen.
 */
export type WizardState =
  | { status: "idle" }
  | { status: "invalid"; fields: string[]; values: WizardValues }
  | { status: "added" }
  | { status: "failed"; values: WizardValues };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Optional text: trimmed, and empty becomes null so the column goes back to "not set". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const profileInput = z.object({
  name: z.string().trim().min(1).max(64),
  headline: optionalText(120),
  bio: optionalText(2000),
});

const formatInput = z
  .object({
    offline: z.boolean(),
    online: z.boolean(),
    city: optionalText(80),
    specialties: z.array(z.string()).transform((values) => [...new Set(values.filter(isSpecialty))]),
  })
  .refine((value) => value.offline || value.online, { path: ["format"] });

const locationInput = z.object({
  name: z.string().trim().min(1).max(80),
  address: optionalText(200),
});

const regionInput = z.object({
  timeZone: z.string().refine(isTimeZone),
  currency: z.enum(CURRENCIES),
});

const cancellationInput = z.object({
  hours: z.coerce
    .number()
    .int()
    .refine((value) => (CANCELLATION_HOURS as readonly number[]).includes(value)),
});

const paymentInput = z.object({
  title: z.string().trim().min(1).max(64),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((value) => URL.canParse(value) && new URL(value).protocol === "https:", { path: ["url"] }),
  kind: z.enum(PAYMENT_LINK_KINDS),
});

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

/** The fields a failed parse points at, without duplicates: the form marks each one. */
function invalid(error: z.ZodError): SaveResult {
  return { status: "invalid", fields: [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "")))] };
}

/** Every field of the form except the step and the button that sent it; repeated names (chips) stay lists. */
function formValues(form: FormData): WizardValues {
  const values: WizardValues = {};
  for (const key of new Set(form.keys())) {
    if (key === "step" || key === "intent" || key.startsWith("$")) continue;
    const all = form.getAll(key).map(String);
    values[key] = all.length > 1 || key === "specialties" ? all : all[0];
  }
  return values;
}

/** The signed-in user's id from the verified session; null signs the request out. */
async function userId(supabase: Supabase): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  return data?.claims.sub ?? null;
}

/**
 * Saves one step for the signed-in trainer and opens the next screen. Writes go through the user's
 * client, so RLS and the column grants decide what a trainer may change, and only in their own rows.
 * Locations and payment links are optional: "Далее" with an empty form just moves on, and
 * "Добавить ещё" (`intent=more`) saves and stays to add another.
 */
export async function saveWizardStep(_previous: WizardState, form: FormData): Promise<WizardState> {
  const step = text(form, "step");
  if (!isWizardStep(step)) return { status: "failed", values: {} };

  const supabase = await createSupabaseServerClient();
  const user = await userId(supabase);
  if (!user) redirect("/onboarding/trainer");

  const result = await saveStep(supabase, user, step, form);
  if (result.status === "invalid") return { ...result, values: formValues(form) };
  if (result.status === "failed") return { status: "failed", values: formValues(form) };
  if (result.status === "saved" && text(form, "intent") === "more") {
    refresh();
    return { status: "added" };
  }
  redirect(nextPath(step));
}

type SaveResult = { status: "invalid"; fields: string[] } | { status: "failed" } | { status: "saved" } | { status: "skipped" };

async function saveStep(supabase: Supabase, user: string, step: WizardStep, form: FormData): Promise<SaveResult> {
  switch (step) {
    case "profile": {
      const parsed = profileInput.safeParse({ name: text(form, "name"), headline: text(form, "headline"), bio: text(form, "bio") });
      if (!parsed.success) return invalid(parsed.error);
      const [settings, trainer] = await Promise.all([
        supabase.from("user_settings").update({ display_name: parsed.data.name }).eq("user_id", user),
        supabase.from("trainer_profiles").update({ headline: parsed.data.headline, bio: parsed.data.bio }).eq("user_id", user),
      ]);
      return done(step, settings.error ?? trainer.error);
    }
    case "format": {
      const parsed = formatInput.safeParse({
        offline: form.get("offline") === "on",
        online: form.get("online") === "on",
        city: text(form, "city"),
        specialties: form.getAll("specialties").map(String),
      });
      if (!parsed.success) return invalid(parsed.error);
      const { offline, online, city, specialties } = parsed.data;
      const { error } = await supabase
        .from("trainer_profiles")
        .update({ works_offline: offline, works_online: online, city, specialties })
        .eq("user_id", user);
      return done(step, error);
    }
    case "locations": {
      if (!text(form, "name").trim() && !text(form, "address").trim()) return { status: "skipped" };
      const parsed = locationInput.safeParse({ name: text(form, "name"), address: text(form, "address") });
      if (!parsed.success) return invalid(parsed.error);
      const { error } = await supabase.from("locations").insert({ trainer_id: user, ...parsed.data });
      return done(step, error);
    }
    case "region": {
      const parsed = regionInput.safeParse({ timeZone: text(form, "timeZone"), currency: text(form, "currency") });
      if (!parsed.success) return invalid(parsed.error);
      const [settings, trainer] = await Promise.all([
        supabase.from("user_settings").update({ time_zone: parsed.data.timeZone }).eq("user_id", user),
        supabase.from("trainer_profiles").update({ default_currency: parsed.data.currency }).eq("user_id", user),
      ]);
      return done(step, settings.error ?? trainer.error);
    }
    case "cancellation": {
      const parsed = cancellationInput.safeParse({ hours: text(form, "hours") });
      if (!parsed.success) return invalid(parsed.error);
      const { error } = await supabase
        .from("trainer_profiles")
        .update({ cancellation_deadline_hours: parsed.data.hours })
        .eq("user_id", user);
      return done(step, error);
    }
    case "payment": {
      if (!text(form, "title").trim() && !text(form, "url").trim()) return { status: "skipped" };
      const parsed = paymentInput.safeParse({ title: text(form, "title"), url: text(form, "url"), kind: text(form, "kind") });
      if (!parsed.success) return invalid(parsed.error);
      const { error } = await supabase.from("payment_links").insert({ trainer_id: user, ...parsed.data });
      return done(step, error);
    }
    case "certificates":
      // "Позже": the result screen shows the client link, so it has to exist by then.
      await ensureClientInvite(supabase, user);
      return { status: "skipped" };
  }
}

function done(step: WizardStep, error: { code: string } | null): SaveResult {
  if (!error) return { status: "saved" };
  console.error(`saving the trainer wizard step ${step} failed`, error.code);
  return { status: "failed" };
}

/** "Создать ссылку" on the result screen when the trainer has no client link (it was archived, or making it failed). */
export async function createClientInvite(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const user = await userId(supabase);
  if (!user) redirect("/onboarding/trainer");
  await ensureClientInvite(supabase, user);
  refresh();
}
