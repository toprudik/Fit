import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";

/** The shared links a chat shows a preview for (marketing §5.6): showcase, trial, referral, client link, trainer invite. */
export const PREVIEW_KINDS = ["showcase", "trial", "referral", "client", "trainer-invite"] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

export function isPreviewKind(value: string): value is PreviewKind {
  return (PREVIEW_KINDS as readonly string[]).includes(value);
}

/** What a public RPC tells anyone holding the link; null trainer when the link is unknown, closed or not loaded. */
export type LinkPreview = {
  kind: PreviewKind;
  trainer: { name: string; headline: string | null } | null;
  /** A trial link's length in minutes. */
  minutes?: number | null;
};

/** The image size chats expect for a large preview. */
export const PREVIEW_SIZE = { width: 1200, height: 630 } as const;

function copyOf(t: Dictionary, kind: PreviewKind) {
  return kind === "trainer-invite" ? t.linkPreview.trainerInvite : t.linkPreview[kind];
}

/** Title, description and the small line above the title on the image. */
export function previewText(t: Dictionary, preview: LinkPreview): { title: string; description: string; kicker: string } {
  const copy = copyOf(t, preview.kind);
  const title = preview.trainer ? interpolate(copy.title, { name: preview.trainer.name }) : copy.generic;
  const kicker =
    preview.kind === "trial" && preview.minutes
      ? `${copy.kicker} · ${interpolate(t.linkPreview.trial.minutes, { minutes: preview.minutes })}`
      : copy.kicker;
  return { title, description: copy.description, kicker };
}

/** Where the image is served: a route handler, since the proxy rewrites every page path to /<locale>/…. */
export function previewImagePath(kind: PreviewKind, id: string | null, locale: Locale): string {
  const search = new URLSearchParams({ lang: locale });
  if (id) search.set("id", id);
  return `/api/og/${kind}?${search}`;
}

/**
 * The preview part of a page's metadata: description, Open Graph and the large Twitter card, which Telegram,
 * WhatsApp and VK read too. Leaves title and robots to the page (noindex stays for the beta).
 */
export function previewMetadata(t: Dictionary, preview: LinkPreview, id: string | null, locale: Locale, appUrl: string): Metadata {
  const { title, description } = previewText(t, preview);
  const image = { url: new URL(previewImagePath(preview.kind, id, locale), appUrl).toString(), ...PREVIEW_SIZE, alt: title };
  return {
    description,
    openGraph: { type: "website", siteName: t.meta.appName, locale: locale === "ru" ? "ru_RU" : "en_US", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
