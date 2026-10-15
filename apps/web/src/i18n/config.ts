/** Supported interface languages (ADR 0013). Adding a language means adding it here and a catalog. */
export const LOCALES = ["ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** Russian when nothing else matches. */
export const DEFAULT_LOCALE: Locale = "ru";

/** The user's explicit choice (or the first detection), readable by the proxy and the browser. */
export const LOCALE_COOKIE = "dafit-locale";

/** BCP 47 tags for Intl formatting. */
export const INTL_LOCALE: Record<Locale, string> = { ru: "ru-RU", en: "en-US" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Maps a language tag ("en-GB", "ru", "EN") to a supported locale, or null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** Language tags from an Accept-Language header, most preferred first. */
export function parseAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag && entry.tag !== "*" && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

/**
 * The interface language (ADR 0013, PRD wave 1 AUTH-1): a saved choice wins; otherwise the
 * person's primary language decides, Telegram's language_code first, then the browser's first
 * Accept-Language entry. Only a primary language we support counts: "de" with English as a
 * second browser language still gets Russian, the default.
 */
export function negotiateLocale(sources: {
  saved?: string | null;
  languageCode?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(sources.saved)) return sources.saved;
  const primary = sources.languageCode?.trim() || parseAcceptLanguage(sources.acceptLanguage)[0];
  return matchLocale(primary) ?? DEFAULT_LOCALE;
}
