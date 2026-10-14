import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { isLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

/**
 * The request's locale. The proxy rewrites every page URL to /<locale>/…, so it is the root
 * param `lang` and pages stay statically prerendered per locale.
 */
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
