import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { formatValue } from "@/lib/progress/measurements";
import type { Macros } from "@/lib/nutrition/target";
import { cn } from "@/lib/utils";

/** "Белки 120 г, жиры 60 г, углеводы 195 г", or null while any of the three is not set. */
export function macrosLine(copy: Dictionary["nutrition"]["target"], locale: Locale, macros: Macros): string | null {
  if (macros.proteinG === null || macros.fatG === null || macros.carbsG === null) return null;
  return interpolate(copy.macros, {
    protein: formatValue(locale, macros.proteinG),
    fat: formatValue(locale, macros.fatG),
    carbs: formatValue(locale, macros.carbsG),
  });
}

/** A target: kcal large, macros under it, and where it came from. */
export function TargetCard({
  t,
  locale,
  macros,
  source,
  heading,
  className,
  children,
}: {
  t: Dictionary;
  locale: Locale;
  macros: Macros;
  /** "Рассчитано по формуле", "От тренера Имя"; omitted where the context already says it. */
  source?: string;
  heading: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const copy = t.nutrition.target;
  return (
    <section aria-label={heading} className={cn("flex flex-col gap-1 rounded-lg bg-surface-1 p-4", className)}>
      <h2 className="text-footnote text-ink-2">{heading}</h2>
      <p className="text-title-1 tabular-nums">{interpolate(copy.kcal, { value: formatValue(locale, macros.kcal) })}</p>
      <p className="text-subhead text-ink-2">{macrosLine(copy, locale, macros) ?? copy.macrosNone}</p>
      {source ? <p className="text-footnote text-ink-2">{source}</p> : null}
      {children}
    </section>
  );
}
