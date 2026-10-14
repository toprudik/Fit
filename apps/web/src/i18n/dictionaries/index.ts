import type { Locale } from "../config";
import { en } from "./en";
import { ru, type Dictionary } from "./ru";

export type { Dictionary };

/** Both catalogs are small, so they ship statically; adding a language is a catalog plus a line here. */
export const dictionaries: Record<Locale, Dictionary> = { ru, en };
