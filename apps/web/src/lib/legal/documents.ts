import type { Locale } from "@/i18n/config";

/**
 * The legal documents shown at /legal (drafts in docs/legal, source of truth in src/content/legal). Each
 * locale has its own set: the Russian documents follow Russian law, the English ones are the international
 * versions, so a slug may exist in one language only.
 */
export const LEGAL_DOCUMENTS = {
  ru: {
    terms: "user-agreement.md",
    privacy: "privacy-policy.md",
    "personal-data": "consent-personal-data.md",
    "health-data": "consent-health-data.md",
    "public-data": "consent-public-data.md",
    marketing: "consent-marketing.md",
    cookies: "cookie-notice.md",
    health: "health-disclaimer.md",
    reviews: "review-rules.md",
    trainers: "trainer-data-processing-agreement.md",
  },
  en: {
    terms: "terms-of-service.md",
    privacy: "privacy-policy.md",
    "health-data": "consumer-health-data-privacy-policy.md",
    cookies: "cookie-policy.md",
    health: "health-disclaimer.md",
    reviews: "community-guidelines.md",
    trainers: "data-processing-addendum.md",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export const LEGAL_PATH = "/legal";

/** The list and the documents: open to everyone, before signing in, the beta terms or while deleting. */
export function isLegalPath(pathname: string): boolean {
  return pathname === LEGAL_PATH || pathname.startsWith(`${LEGAL_PATH}/`);
}

/** Every slug in any locale, for generateStaticParams. */
export const ALL_LEGAL_SLUGS: readonly string[] = [
  ...new Set(Object.values(LEGAL_DOCUMENTS).flatMap((documents) => Object.keys(documents))),
];

/** Slugs of a locale in display order. */
export function legalSlugs(locale: Locale): string[] {
  return Object.keys(LEGAL_DOCUMENTS[locale]);
}

/** The file behind a slug in a locale, or null when that language has no such document. */
export function legalFile(locale: Locale, slug: string): string | null {
  const documents: Record<string, string> = LEGAL_DOCUMENTS[locale];
  return Object.hasOwn(documents, slug) ? documents[slug] : null;
}

/**
 * Links between documents are written as file names ("privacy-policy.md#5-права"); in the app they lead
 * to the document's page in the same language, and a file not published there leads to the list.
 */
export function legalHref(locale: Locale, href: string): string {
  const match = /^(?:\.\/)?([\w-]+\.md)(#.*)?$/.exec(href);
  if (!match) return href;
  const documents: Record<string, string> = LEGAL_DOCUMENTS[locale];
  const slug = Object.keys(documents).find((key) => documents[key] === match[1]);
  return slug ? `${LEGAL_PATH}/${slug}${match[2] ?? ""}` : LEGAL_PATH;
}

/** Notes for the lawyer and the team in the drafts: never shown in the app. */
export const INTERNAL_NOTES = ["Юристу:", "Counsel:", "Команде:", "Team:"] as const;
