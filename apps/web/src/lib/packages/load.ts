import "server-only";

import type { PaymentLinkKind } from "@/lib/trainer-wizard/options";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PackageAppliesTo } from "./grid";

export type TrainerPackage = {
  id: string;
  title: string;
  sessionsCount: number;
  priceMinor: number;
  currency: string;
  validityDays: number | null;
  appliesTo: PackageAppliesTo;
  isPublic: boolean;
};

export type TrainerPackages = {
  /** The trainer's default currency: the grid is in it (PRD wave-1 §2.8 rule 3). */
  currency: string;
  packages: TrainerPackage[];
  paymentLinks: { id: string; title: string; url: string; kind: PaymentLinkKind }[];
};

/**
 * The signed-in trainer's live packages and payment links, read under RLS: `signed-out` without a session,
 * `not-trainer` without a trainer profile.
 */
export async function loadTrainerPackages(): Promise<
  { status: "signed-out" } | { status: "not-trainer" } | { status: "failed" } | ({ status: "ok" } & TrainerPackages)
> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const user = session?.claims.sub;
  if (!user) return { status: "signed-out" };

  const [trainer, packages, links] = await Promise.all([
    supabase.from("trainer_profiles").select("default_currency").eq("user_id", user).maybeSingle(),
    supabase
      .from("packages")
      .select("id, title, sessions_count, price_minor, currency, validity_days, applies_to, is_public")
      .eq("trainer_id", user)
      .is("archived_at", null)
      .order("applies_to")
      .order("sessions_count")
      .order("sort_order")
      .order("created_at"),
    supabase.from("payment_links").select("id, title, url, kind").eq("trainer_id", user).is("archived_at", null).order("sort_order").order("created_at"),
  ]);
  const failed = [trainer, packages, links].find((result) => result.error);
  if (failed?.error) {
    console.error("loading packages failed", failed.error.code);
    return { status: "failed" };
  }
  if (!trainer.data) return { status: "not-trainer" };

  return {
    status: "ok",
    currency: trainer.data.default_currency,
    packages: (packages.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      sessionsCount: row.sessions_count,
      priceMinor: row.price_minor,
      currency: row.currency,
      validityDays: row.validity_days,
      appliesTo: row.applies_to,
      isPublic: row.is_public,
    })),
    paymentLinks: links.data ?? [],
  };
}
