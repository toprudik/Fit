import "server-only";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The admin pages' own check (ADM-12): the proxy already answers 404 to everyone but admins, and every
 * page checks again so it stays closed on its own. Returns the user's client and the admin's time zone
 * for dates.
 */
export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) notFound();

  const [{ data: admin }, { data: settings }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (!admin) notFound();

  return { supabase, userId, timeZone: settings?.time_zone ?? "Europe/Moscow" };
}
