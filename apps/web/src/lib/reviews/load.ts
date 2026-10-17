import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { REVIEW_COLUMNS, reviewOf, type Review } from "./reviews";

export type MyReview = { attended: number; eligible: boolean; review: Review | null };

/** The client's review of the pair and whether they may leave one. Null outside the caller's own pair. */
export async function loadMyReview(coachingId: string): Promise<MyReview | null> {
  const supabase = await createSupabaseServerClient();
  const [eligibility, review] = await Promise.all([
    supabase.rpc("review_eligibility", { p_coaching_id: coachingId }),
    supabase.from("reviews").select(REVIEW_COLUMNS).eq("coaching_id", coachingId).maybeSingle(),
  ]);
  if (eligibility.error) throw new Error(`loading the review rule failed: ${eligibility.error.code}`);
  if (review.error) throw new Error(`loading the review failed: ${review.error.code}`);
  const row = eligibility.data?.[0];
  if (!row) return null;
  return { attended: row.attended, eligible: row.eligible, review: review.data ? reviewOf(review.data) : null };
}

export type TrainerReview = Review & { clientName: string };

export type TrainerReviews = { reviews: TrainerReview[]; timeZone: string };

/** The signed-in trainer's reviews, newest first, with the client's name; hidden ones are not there (§11-7). */
export async function loadTrainerReviews(): Promise<TrainerReviews | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const [{ data, error }, settings] = await Promise.all([
    supabase.from("reviews").select(`${REVIEW_COLUMNS}, client_id`).eq("trainer_id", userId).order("created_at", { ascending: false }),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error(`loading the reviews failed: ${error.code}`);
  const ids = [...new Set(data.map((row) => row.client_id))];
  const people = ids.length
    ? await supabase.from("profiles").select("id, first_name, last_name, display_name").in("id", ids)
    : { data: [], error: null };
  if (people.error) throw new Error(`loading the reviewers failed: ${people.error.code}`);
  const names = new Map(
    (people.data ?? []).map((person) => [
      person.id,
      person.display_name?.trim() || [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" "),
    ]),
  );
  return {
    reviews: data.map((row) => ({ ...reviewOf(row), clientName: names.get(row.client_id) ?? "" })),
    timeZone: settings.data?.time_zone ?? "Europe/Moscow",
  };
}
