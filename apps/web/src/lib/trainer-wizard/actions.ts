"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { dictionaries } from "@/i18n/dictionaries";
import { formLocale, formStrings, TEMPLATE_FIELDS, templateInput, templateRows } from "@/lib/packages/input";
import { paymentLinkInput } from "@/lib/payment-links/input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BOOKING_NOTICE_HOURS, CANCELLATION_HOURS, CURRENCIES, isSpecialty, isTimeZone } from "./options";
import { isEditableStep, isWizardStep, nextPath, PROFILE_EDIT_PATH, type WizardStep } from "./steps";

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

const offered = (options: readonly number[]) =>
  z.coerce
    .number()
    .int()
    .refine((value) => options.includes(value));

const cancellationInput = z.object({
  hours: offered(CANCELLATION_HOURS),
  /** Hours of booking notice; a form without the field leaves the trainer's setting as it is. */
  notice: offered(BOOKING_NOTICE_HOURS).optional(),
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
    if (key === "step" || key === "intent" || key === "mode" || key.startsWith("$")) continue;
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
 * "Добавить ещё" (`intent=more`) saves and stays to add another. From "Профиль тренера" (`mode=edit`)
 * "Сохранить" goes back to that screen instead of the next step.
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
  redirect(text(form, "mode") === "edit" && isEditableStep(step) ? PROFILE_EDIT_PATH : nextPath(step));
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
      const parsed = cancellationInput.safeParse({ hours: text(form, "hours"), notice: form.has("notice") ? text(form, "notice") : undefined });
      if (!parsed.success) return invalid(parsed.error);
      const { hours, notice } = parsed.data;
      const { error } = await supabase
        .from("trainer_profiles")
        .update({ cancellation_deadline_hours: hours, ...(notice === undefined ? {} : { min_booking_notice_minutes: notice * 60 }) })
        .eq("user_id", user);
      return done(step, error);
    }
    case "payment": {
      if (!text(form, "title").trim() && !text(form, "url").trim()) return { status: "skipped" };
      const parsed = paymentLinkInput.safeParse({ title: text(form, "title"), url: text(form, "url"), kind: text(form, "kind") });
      if (!parsed.success) return invalid(parsed.error);
      const { error } = await supabase.from("payment_links").insert({ trainer_id: user, ...parsed.data });
      return done(step, error);
    }
    case "prices": {
      // A trainer who already has packages edits them under "Деньги"; "Далее" just moves on.
      if (text(form, "existing") === "1" || !text(form, "dropIn").trim()) return { status: "skipped" };
      const parsed = templateInput.safeParse(formStrings(form, TEMPLATE_FIELDS));
      if (!parsed.success) return invalid(parsed.error);
      const trainer = await supabase.from("trainer_profiles").select("default_currency").eq("user_id", user).single();
      if (trainer.error) return done(step, trainer.error);
      const locale = formLocale(form);
      const { error } = await supabase
        .from("packages")
        .insert(templateRows(parsed.data, { id: user, currency: trainer.data.default_currency }, dictionaries[locale], locale));
      return done(step, error);
    }
    case "certificates":
      return { status: "skipped" };
  }
}

function done(step: WizardStep, error: { code: string } | null): SaveResult {
  if (!error) return { status: "saved" };
  console.error(`saving the trainer wizard step ${step} failed`, error.code);
  return { status: "failed" };
}

export type LocationState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; fields: string[]; values: WizardValues }
  | { status: "failed"; values: WizardValues };

/**
 * "Добавить место" and "Изменить" on the trainer's places: with an `id` the place is renamed or
 * re-addressed, without one a new place is added. RLS keeps both to the signed-in trainer's own rows.
 */
export async function saveLocation(_previous: LocationState, form: FormData): Promise<LocationState> {
  const values = { name: text(form, "name"), address: text(form, "address") };
  const parsed = locationInput.safeParse(values);
  if (!parsed.success) {
    return { status: "invalid", fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))], values };
  }
  const id = text(form, "id");
  if (id && !z.uuid().safeParse(id).success) return { status: "failed", values };

  const supabase = await createSupabaseServerClient();
  const user = await userId(supabase);
  if (!user) return { status: "failed", values };
  const { data, error } = id
    ? await supabase.from("locations").update(parsed.data).eq("id", id).is("archived_at", null).select("id")
    : await supabase.from("locations").insert({ trainer_id: user, ...parsed.data }).select("id");
  if (error || data.length !== 1) {
    console.error("saving a location failed", error?.code);
    return { status: "failed", values };
  }
  refresh();
  return { status: "saved" };
}

/**
 * "Удалить" a place: archived, so it leaves the lists where sessions are created; sessions already
 * held or booked there keep showing its name and address.
 */
export async function archiveLocation(id: string): Promise<{ failed: boolean }> {
  if (!z.uuid().safeParse(id).success) return { failed: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("locations")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error || data.length !== 1) {
    console.error("archiving a location failed", error?.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
