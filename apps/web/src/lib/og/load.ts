import "server-only";
import type { Metadata } from "next";
import { clientEnv } from "@/env/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { isClientLinkToken, personName } from "@/lib/client-links/link";
import { isReferralCode } from "@/lib/referrals/link";
import { isShowcaseSlug, normalizeSlug } from "@/lib/showcase/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isTrialToken } from "@/lib/trial-links/link";
import { previewMetadata, type LinkPreview, type PreviewKind } from "./preview";

/** Statuses that mean the link leads nowhere; the preview then shows the generic text. */
const CLOSED = ["invalid", "unavailable"];

type Row = { status: string | null; headline: string | null };

function trainerOf(row: Row | undefined, name: string): LinkPreview["trainer"] {
  if (!row || !row.status || CLOSED.includes(row.status) || !name) return null;
  return { name, headline: row.headline?.trim() || null };
}

/**
 * The trainer a shared link leads to, read through the same public RPCs as its landing page, so a preview shows
 * nothing the page does not. A malformed id skips the database; a failed read falls back to the generic preview.
 */
export async function loadLinkPreview(kind: PreviewKind, id: string | null): Promise<LinkPreview> {
  const generic: LinkPreview = { kind, trainer: null };
  if (kind === "trainer-invite" || !id) return generic;
  const supabase = await createSupabaseServerClient();
  if (kind === "showcase") {
    const slug = normalizeSlug(id);
    if (!isShowcaseSlug(slug)) return generic;
    const { data, error } = await supabase.rpc("get_trainer_showcase", { p_slug: slug });
    if (error) console.error("reading a showcase preview failed", error.code);
    const row = data?.[0];
    return { kind, trainer: row?.status === "available" ? trainerOf(row, row.name?.trim() ?? "") : null };
  }
  if (kind === "trial") {
    if (!isTrialToken(id)) return generic;
    const { data, error } = await supabase.rpc("get_trial_link", { p_token: id });
    if (error) console.error("reading a trial link preview failed", error.code);
    const row = data?.[0];
    return { kind, trainer: trainerOf(row, row?.name?.trim() ?? ""), minutes: row?.duration_min ?? null };
  }
  if (kind === "referral") {
    if (!isReferralCode(id)) return generic;
    const { data, error } = await supabase.rpc("resolve_referral", { p_code: id });
    if (error) console.error("reading a referral preview failed", error.code);
    const row = data?.[0];
    return { kind, trainer: trainerOf(row, personName(row?.first_name, row?.last_name)) };
  }
  if (!isClientLinkToken(id)) return generic;
  const { data, error } = await supabase.rpc("resolve_client_invite", { p_token: id });
  if (error) console.error("reading a client link preview failed", error.code);
  const row = data?.[0];
  return { kind, trainer: trainerOf(row, personName(row?.first_name, row?.last_name)) };
}

/**
 * The preview metadata of a shared link's page. The image gets the id only when the link leads to a trainer, so a
 * mistyped or closed link shares the cached generic picture.
 */
export async function linkPreviewMetadata(kind: PreviewKind, id: string | null): Promise<Metadata> {
  const [t, locale, preview] = await Promise.all([getDictionary(), getLocale(), loadLinkPreview(kind, id)]);
  const imageId = preview.trainer && id ? (kind === "showcase" ? normalizeSlug(id) : id) : null;
  return previewMetadata(t, preview, imageId, locale, clientEnv.NEXT_PUBLIC_APP_URL);
}
