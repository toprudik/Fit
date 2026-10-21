import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cacheLife } from "next/cache";
import { clientEnv } from "@/env/client";
import { legalOperatorEnv } from "@/env/server";
import type { Locale } from "@/i18n/config";
import { LEGAL_VERSION } from "@/lib/consent/required";
import { INTERNAL_NOTES, legalFile, legalHref } from "./documents";
import { fillPlaceholders, hostOf } from "./fill";
import { dropSections, inlineText, parseMarkdown, type Block } from "./markdown";

export type LegalDoc = { title: string; blocks: Block[] };

/** The text of a document file with the operator's details, the site and the version filled in. */
export async function readLegalSource(locale: Locale, file: string): Promise<string> {
  const source = await readFile(join(process.cwd(), "src/content/legal", locale, file), "utf8");
  const operator = legalOperatorEnv();
  return fillPlaceholders(source, {
    operatorName: operator.LEGAL_OPERATOR_NAME,
    operatorAddress: operator.LEGAL_OPERATOR_ADDRESS,
    contactEmail: operator.LEGAL_CONTACT_EMAIL,
    domain: hostOf(clientEnv.NEXT_PUBLIC_APP_URL),
    version: LEGAL_VERSION,
  });
}

/** A document of a locale, parsed; null when that language has no such document. Read once per build. */
export async function loadLegalDocument(locale: Locale, slug: string): Promise<LegalDoc | null> {
  "use cache";
  cacheLife("max");
  const file = legalFile(locale, slug);
  if (!file) return null;
  const source = await readLegalSource(locale, file);
  const parsed = parseMarkdown(source, { link: (href) => legalHref(locale, href), dropQuotes: INTERNAL_NOTES });
  // "## 0. Как показывать…" is for the team, never part of the document.
  const blocks = dropSections(parsed, (heading) => /^0\.\s/.test(heading));
  const heading = blocks.find((block) => block.kind === "heading" && block.level === 1);
  return { title: heading?.kind === "heading" ? inlineText(heading.children) : slug, blocks };
}
