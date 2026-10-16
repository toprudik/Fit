import { z } from "zod";
import { isLocale, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { parseMajor } from "@/lib/money/format";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { APPLIES_TO, TEMPLATE, VALIDITY_DAYS } from "./grid";
import { packageTitle } from "./present";

const validity = z
  .string()
  .transform((value) => (value ? Number(value) : null))
  .refine((value) => value === null || (VALIDITY_DAYS as readonly number[]).includes(value));

const price = z
  .string()
  .transform((value) => parseMajor(value))
  .refine((value) => value !== null)
  .transform((value) => value as number);

/** A price that may be left empty: null means "no such pack". */
const optionalPrice = z
  .string()
  .transform((value) => (value.trim() ? parseMajor(value) : undefined))
  .refine((value) => value !== null)
  .transform((value) => (value === undefined ? null : (value as number)));

export const templateInput = z.object({
  dropIn: price.refine((value) => value > 0),
  p5: optionalPrice,
  p10: optionalPrice,
  p20: optionalPrice,
  validity,
});

export const packageInput = z.object({
  id: z.string().transform((value) => value || null).refine((value) => value === null || z.uuid().safeParse(value).success),
  title: z.string().trim().max(120),
  sessions: z.coerce.number().int().min(1).max(200),
  price,
  validity,
  appliesTo: z.enum(APPLIES_TO as [string, ...string[]]).transform((value) => value as (typeof APPLIES_TO)[number]),
  isPublic: z.boolean(),
});

/** The fields a form sends, as strings; repeated names are not used by these forms. */
export function formStrings(form: FormData, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, String(form.get(name) ?? "")]));
}

export { packageTitle };

/**
 * The language to name unnamed packages in. Server Actions have no route params, so the form sends the
 * page's locale (a hidden field); anything else falls back to Russian. It only picks a label.
 */
export function formLocale(form: FormData): Locale {
  const value = String(form.get("locale") ?? "");
  return isLocale(value) ? value : "ru";
}

export const TEMPLATE_FIELDS = ["dropIn", "p5", "p10", "p20", "validity"] as const;

/** The rows the template creates: the drop-in without expiry and each filled-in pack with the chosen one. */
export function templateRows(
  values: z.infer<typeof templateInput>,
  trainer: { id: string; currency: string },
  t: Dictionary,
  locale: Locale,
): TablesInsert<"packages">[] {
  const packs = TEMPLATE.map(({ sessions }) => ({ sessions, priceMinor: values[`p${sessions}` as "p5" | "p10" | "p20"] }));
  return [
    { trainer_id: trainer.id, title: packageTitle(t, locale, 1), sessions_count: 1, price_minor: values.dropIn, currency: trainer.currency, sort_order: 0 },
    ...packs.flatMap(({ sessions, priceMinor }, index) =>
      priceMinor === null
        ? []
        : [
            {
              trainer_id: trainer.id,
              title: packageTitle(t, locale, sessions),
              sessions_count: sessions,
              price_minor: priceMinor,
              currency: trainer.currency,
              validity_days: values.validity,
              sort_order: index + 1,
            },
          ],
    ),
  ];
}
