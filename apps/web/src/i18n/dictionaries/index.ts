import type { Locale } from "../config";
import { en } from "./en";
import { ru, type Dictionary } from "./ru";

export type { Dictionary };

/**
 * Both catalogs, for server code. The browser gets only the active one, through I18nProvider.
 * Adding a language is a catalog plus a line here.
 */
export const dictionaries: Record<Locale, Dictionary> = { ru, en };
