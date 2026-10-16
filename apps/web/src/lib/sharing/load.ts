import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SHARE_CATEGORIES, type Shares } from "./categories";

/** Without a session the page asks to sign in instead of answering "not found". */
export const SIGNED_OUT = "signed-out";

export type ClientSharing = {
  coachingId: string;
  live: boolean;
  trainerName: string;
  shares: Shares;
};

type Person = { first_name: string | null; last_name: string | null; display_name: string | null } | null;

function nameOf(person: Person): string {
  if (!person) return "";
  return person.display_name?.trim() || [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
}

/**
 * The client's side of one pair: the trainer and the flags of data_shares. Null when the id is not a pair
 * where the signed-in user is the client; only the client changes these flags (data-model §4.3).
 */
export async function loadClientSharing(coachingId: string): Promise<ClientSharing | typeof SIGNED_OUT | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return SIGNED_OUT;
  if (!z.uuid().safeParse(coachingId).success) return null;
  const { data: pair, error } = await supabase.from("coachings").select("id, trainer_id, client_id, status").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair || pair.client_id !== userId) return null;
  const [share, trainer] = await Promise.all([
    supabase.from("data_shares").select(SHARE_CATEGORIES.join(", ")).eq("coaching_id", pair.id).maybeSingle(),
    supabase.from("profiles").select("first_name, last_name, display_name").eq("id", pair.trainer_id).maybeSingle(),
  ]);
  if (share.error) throw new Error(`loading the shares failed: ${share.error.code}`);
  if (trainer.error) throw new Error(`loading the trainer failed: ${trainer.error.code}`);
  const row = (share.data ?? {}) as Partial<Shares>;
  return {
    coachingId: pair.id,
    live: pair.status !== "ended",
    trainerName: nameOf(trainer.data),
    shares: Object.fromEntries(SHARE_CATEGORIES.map((category) => [category, row[category] === true])) as Shares,
  };
}

/**
 * What the client of this pair shares with its trainer, for the trainer's screens: they show "Клиент закрыл …"
 * instead of an empty state when a category is off. Null when the caller is not this pair's trainer. RLS
 * (private.can_view) already hides the data itself; this only picks the words. The flags open nothing once
 * the pair has ended, so an ended pair reads as all closed.
 */
export async function loadTrainerShares(coachingId: string): Promise<Shares | null> {
  if (!z.uuid().safeParse(coachingId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data: pair, error } = await supabase.from("coachings").select("trainer_id, status").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair || pair.trainer_id !== userId) return null;
  const share = await supabase.from("data_shares").select(SHARE_CATEGORIES.join(", ")).eq("coaching_id", coachingId).maybeSingle();
  if (share.error) throw new Error(`loading the shares failed: ${share.error.code}`);
  const row = (share.data ?? {}) as Partial<Shares>;
  const live = pair.status !== "ended";
  return Object.fromEntries(SHARE_CATEGORIES.map((category) => [category, live && row[category] === true])) as Shares;
}
