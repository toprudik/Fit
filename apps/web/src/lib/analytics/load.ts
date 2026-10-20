import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Whether the signed-in user's app openings are counted; null without a session. */
export async function loadAppOpensCounted(): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return null;
  const { data, error } = await supabase.rpc("my_app_opens_counted");
  if (error) throw new Error(`loading the app-opening switch failed: ${error.code}`);
  return data;
}
