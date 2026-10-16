"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isShareCategory, type ShareCategory } from "./categories";

type ShareUpdate = { [Key in ShareCategory]?: boolean };

/** One column of data_shares, typed per category. */
const shareUpdate = (category: ShareCategory, shared: boolean): ShareUpdate => ({ [category]: shared }) as ShareUpdate;

export type SetShareResult = { ok: boolean };

/**
 * One switch on "Доступ к данным": opens or closes a category for this pair's trainer at once (PRIV-4).
 * RLS lets only the pair's client write data_shares; an intake change also answers the consent step.
 */
export async function setShare(input: { coachingId: string; category: ShareCategory; shared: boolean }): Promise<SetShareResult> {
  if (!z.uuid().safeParse(input.coachingId).success || !isShareCategory(input.category) || typeof input.shared !== "boolean") {
    return { ok: false };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("data_shares")
    .update(shareUpdate(input.category, input.shared))
    .eq("coaching_id", input.coachingId)
    .select("coaching_id");
  if (error) console.error("saving a data share failed", error.code);
  const ok = !error && Boolean(data?.length);
  if (ok) refresh();
  return { ok };
}
