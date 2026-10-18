import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";

/** Every string of a catalog outside `help`, to check that answers name buttons that exist. */
function strings(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (node && typeof node === "object") return Object.values(node).flatMap(strings);
  return [];
}

/** Labels quoted in an answer: «…» in Russian, “…” in English. */
const QUOTED = { ru: /«([^»]+)»/g, en: /“([^”]+)”/g } as const;

describe("help (FAQ)", () => {
  for (const locale of LOCALES) {
    const { help, ...rest } = dictionaries[locale];
    const sections = [...help.trainer, ...help.client, ...help.common];
    const elsewhere = strings(rest);

    it(`has questions in every section and no repeated question in ${locale}`, () => {
      for (const section of sections) expect(section.items.length, section.title).toBeGreaterThan(0);
      for (const zone of ["trainer", "client"] as const) {
        const questions = [...help[zone], ...help.common].flatMap((section) => section.items.map((item) => item.q));
        expect(new Set(questions).size).toBe(questions.length);
      }
    });

    it(`quotes only labels the app shows in ${locale}`, () => {
      const texts = sections.flatMap((section) => section.items.flatMap((item) => [item.q, item.a]));
      const labels = texts.flatMap((text) => [...text.matchAll(QUOTED[locale])].map((match) => match[1]));
      const missing = labels.filter((label) => !elsewhere.some((value) => value.includes(label)));
      expect(missing).toEqual([]);
    });
  }
});
