import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import type { Locale } from "@/i18n/config";
import { legalFile } from "@/lib/legal/documents";
import { loadLegalDocument } from "@/lib/legal/load";
import type { Block } from "@/lib/legal/markdown";
import type { ConsentKind } from "./required";

/**
 * The document behind each consent, by locale (slugs of lib/legal/documents). Russian users give the consents of
 * Russian law; the English set has no separate personal-data consent, so its screen shows the privacy policy.
 */
const CONSENT_SLUGS: Record<Locale, Partial<Record<ConsentKind, string>>> = {
  ru: { terms: "terms", privacy_policy: "privacy", pd_general: "personal-data", pd_health: "health-data" },
  en: { terms: "terms", privacy_policy: "privacy", pd_general: "privacy", pd_health: "health-data" },
};

export type ConsentDocument = { slug: string; title: string; blocks: Block[]; hash: string };

/**
 * The document of a consent without its title (the screen has its own) and the sha256 of the file as it is in the
 * repository, notes for the lawyer included: the hash stored with the consent ties it to that exact text.
 */
export async function loadConsentDocument(locale: Locale, kind: ConsentKind): Promise<ConsentDocument | null> {
  "use cache";
  cacheLife("max");
  const slug = CONSENT_SLUGS[locale][kind];
  const file = slug ? legalFile(locale, slug) : null;
  const document = slug ? await loadLegalDocument(locale, slug) : null;
  if (!slug || !file || !document) return null;
  const source = await readFile(join(process.cwd(), "src/content/legal", locale, file), "utf8");
  return {
    slug,
    title: document.title,
    blocks: document.blocks.filter((block) => !(block.kind === "heading" && block.level === 1)),
    hash: createHash("sha256").update(source).digest("hex"),
  };
}
