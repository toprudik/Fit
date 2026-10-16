import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Supabase } from "./client-link";

export type WizardData = Awaited<ReturnType<typeof read>>;

/** "Анна Смирнова" from Telegram's first and last name, else the username. */
function telegramName(profile: { first_name: string | null; last_name: string | null; username: string | null } | null): string {
  if (!profile) return "";
  const fullName = [profile.first_name, profile.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return fullName || profile.username?.trim() || "";
}

async function read(supabase: Supabase, user: string) {
  // Columns are listed: profiles hides some by grant, so select("*") fails there (CLAUDE.md).
  const [trainer, settings, profile, locations, paymentLinks, packages] = await Promise.all([
    supabase
      .from("trainer_profiles")
      .select(
        "slug, headline, bio, specialties, city, works_offline, works_online, verification_status, default_currency, cancellation_deadline_hours",
      )
      .eq("user_id", user)
      .maybeSingle(),
    supabase.from("user_settings").select("display_name, time_zone").eq("user_id", user).maybeSingle(),
    supabase.from("profiles").select("first_name, last_name, username, photo_url").eq("id", user).maybeSingle(),
    supabase.from("locations").select("id, name, address").eq("trainer_id", user).is("archived_at", null).order("created_at"),
    supabase.from("payment_links").select("id, title, url, kind").eq("trainer_id", user).is("archived_at", null).order("created_at"),
    supabase.from("packages").select("id", { count: "exact", head: true }).eq("trainer_id", user).is("archived_at", null),
  ]);
  const failed = [trainer, settings, profile, locations, paymentLinks, packages].find((result) => result.error);
  if (failed?.error) throw new Error(`reading the trainer wizard failed: ${failed.error.code}`);
  if (!trainer.data) return null;

  const telegram = telegramName(profile.data);
  return {
    user,
    trainer: trainer.data,
    /** The name set in DaFit, else the one from Telegram. */
    name: settings.data?.display_name ?? telegram,
    photoUrl: profile.data?.photo_url ?? null,
    timeZone: settings.data?.time_zone ?? "Europe/Moscow",
    locations: locations.data ?? [],
    paymentLinks: paymentLinks.data ?? [],
    /** Live packages: with any, the price grid step only points to "Деньги". */
    packageCount: packages.count ?? 0,
  };
}

/**
 * Everything the wizard screens show for the signed-in trainer: `signed-out` without a session,
 * `not-trainer` before an invite was redeemed (both go back to /onboarding/trainer).
 */
export async function loadWizard(): Promise<{ status: "signed-out" } | { status: "not-trainer" } | { status: "ok"; data: NonNullable<WizardData>; supabase: Supabase }> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return { status: "signed-out" };
  const data = await read(supabase, user);
  return data ? { status: "ok", data, supabase } : { status: "not-trainer" };
}
