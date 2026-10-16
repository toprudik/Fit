"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { dictionaries } from "@/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formLocale, formStrings, packageInput, packageTitle, TEMPLATE_FIELDS, templateInput, templateRows } from "./input";

/** What was typed, so the form shows it again after React resets it on submit. */
export type PackageValues = Record<string, string>;

/** `invalid` names the fields to fix; `taken` is a second live drop-in for the same currency and type. */
export type PackageFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "invalid"; fields: string[]; values: PackageValues }
  | { status: "taken"; values: PackageValues }
  | { status: "failed"; values: PackageValues };

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const fieldsOf = (error: z.ZodError) => [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "")))];

/** The signed-in trainer and their default currency, read under RLS; null when not a trainer. */
async function trainer(supabase: Supabase): Promise<{ id: string; currency: string } | null> {
  const { data: session } = await supabase.auth.getClaims();
  const id = session?.claims.sub;
  if (!id) return null;
  const { data, error } = await supabase.from("trainer_profiles").select("default_currency").eq("user_id", id).maybeSingle();
  if (error) console.error("loading the trainer currency failed", error.code);
  return data ? { id, currency: data.default_currency } : null;
}

/**
 * "Создать сетку" on /trainer/money/packages: the drop-in and the 5/10/20 packs of the template, in the
 * trainer's default currency. Writes go through the user's client, so RLS keeps them to the trainer's rows.
 */
export async function createGridFromTemplate(_previous: PackageFormState, form: FormData): Promise<PackageFormState> {
  const values = formStrings(form, TEMPLATE_FIELDS);
  const parsed = templateInput.safeParse(values);
  if (!parsed.success) return { status: "invalid", fields: fieldsOf(parsed.error), values };

  const supabase = await createSupabaseServerClient();
  const owner = await trainer(supabase);
  const locale = formLocale(form);
  const t = dictionaries[locale];
  if (!owner) return { status: "failed", values };
  const { error } = await supabase.from("packages").insert(templateRows(parsed.data, owner, t, locale));
  if (error) {
    // 23505: the trainer already has a live drop-in in this currency (packages_one_drop_in).
    if (error.code === "23505") return { status: "taken", values };
    console.error("creating the price grid failed", error.code);
    return { status: "failed", values };
  }
  refresh();
  return { status: "saved" };
}

const PACKAGE_FIELDS = ["id", "title", "sessions", "price", "validity", "appliesTo"] as const;

/**
 * "Сохранить" in the package form: a new package in the trainer's default currency, or the edited one.
 * A changed price touches only the package: passes keep the price they were issued with (§2.8 edge cases).
 */
export async function savePackage(_previous: PackageFormState, form: FormData): Promise<PackageFormState> {
  const values = { ...formStrings(form, PACKAGE_FIELDS), isPublic: form.get("isPublic") === "on" ? "on" : "" };
  const parsed = packageInput.safeParse({ ...values, isPublic: values.isPublic === "on" });
  if (!parsed.success) return { status: "invalid", fields: fieldsOf(parsed.error), values };

  const supabase = await createSupabaseServerClient();
  const owner = await trainer(supabase);
  const locale = formLocale(form);
  const t = dictionaries[locale];
  if (!owner) return { status: "failed", values };
  const input = parsed.data;
  const fields = {
    title: input.title || packageTitle(t, locale, input.sessions),
    sessions_count: input.sessions,
    price_minor: input.price,
    validity_days: input.validity,
    applies_to: input.appliesTo,
    is_public: input.isPublic,
  };
  const { data, error } = input.id
    ? await supabase.from("packages").update(fields).eq("id", input.id).is("archived_at", null).select("id")
    : await supabase.from("packages").insert({ ...fields, trainer_id: owner.id, currency: owner.currency }).select("id");
  if (error || data.length !== 1) {
    if (error?.code === "23505") return { status: "taken", values };
    console.error("saving a package failed", error?.code);
    return { status: "failed", values };
  }
  refresh();
  return { status: "saved" };
}

/** "Убрать": a package is archived, never deleted, because passes keep it for history. */
export async function archivePackage(id: string): Promise<{ failed: boolean }> {
  if (!z.uuid().safeParse(id).success) return { failed: true };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("packages")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id");
  if (error || data.length !== 1) {
    console.error("archiving a package failed", error?.code);
    return { failed: true };
  }
  refresh();
  return { failed: false };
}
