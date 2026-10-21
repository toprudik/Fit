import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { seasonChallengeFrom } from "./season";

/** The season challenge to show the signed-in client (my_season_challenge), or null without one or a session. */
export async function loadMySeasonChallenge() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return null;
  const { data, error } = await supabase.rpc("my_season_challenge");
  if (error) throw new Error(`loading the season challenge failed: ${error.code}`);
  return seasonChallengeFrom(data);
}
