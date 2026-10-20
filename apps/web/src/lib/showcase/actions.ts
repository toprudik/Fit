"use server";

import { refresh } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isShowcaseSlug, normalizeSlug } from "./link";

/** "Сохранить адрес": `value` is what was typed, so the field keeps it after React resets the form. */
export type AddressState =
  | { status: "idle" }
  | { status: "saved"; slug: string }
  | { status: "error"; reason: "invalid" | "taken" | "failed"; value: string };

/** The signed-in trainer's own row, changed under RLS and the column grants; false when nothing matched. */
async function updateOwnProfile(
  values: { slug: string } | { story_card_showcase: boolean },
): Promise<{ ok: boolean; code?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return { ok: false };
  const { data, error } = await supabase.from("trainer_profiles").update(values).eq("user_id", userId).select("user_id");
  if (error) return { ok: false, code: error.code };
  return { ok: data.length === 1 };
}

/**
 * The showcase address (screens.md §2.2 "Витрина (редактор)"). The database keeps it unique and in
 * the slug format; the old address stops working at once, like a reissued client link.
 */
export async function saveShowcaseAddress(_previous: AddressState, formData: FormData): Promise<AddressState> {
  const value = String(formData.get("slug") ?? "");
  const slug = normalizeSlug(value);
  if (!isShowcaseSlug(slug)) return { status: "error", reason: "invalid", value };

  const { ok, code } = await updateOwnProfile({ slug });
  if (!ok) {
    // 23505: another trainer has it; 23514: the format check, if the two rules ever drift apart.
    const reason = code === "23505" ? "taken" : code === "23514" ? "invalid" : "failed";
    if (reason === "failed") console.error("saving the showcase address failed", code);
    return { status: "error", reason, value };
  }
  refresh();
  return { status: "saved", slug };
}

/** "Имя и QR на карточках клиентов" (PRD wave-3 §4 rule 7): applies at once, on by default. */
export async function setStoryCardShowcase(enabled: boolean): Promise<{ ok: boolean }> {
  const { ok, code } = await updateOwnProfile({ story_card_showcase: enabled === true });
  if (!ok) console.error("switching the story card showcase failed", code);
  else refresh();
  return { ok };
}
