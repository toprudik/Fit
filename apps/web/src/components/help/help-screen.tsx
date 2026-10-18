import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { getDictionary } from "@/i18n/server";
import type { Zone } from "@/lib/navigation/zones";
import { helpPath } from "./path";

/**
 * Help: the zone's questions, then the ones every user asks (`help.common`), as native disclosures
 * that open before hydration and need no script. Chips at the top jump to a topic; the page's
 * scroll-padding keeps the heading clear of the header bar. Static: nothing here depends on who is signed in.
 */
export async function HelpScreen({ zone, back }: { zone: Zone; back: string }) {
  const t = await getDictionary();
  const copy = t.help;
  const sections = [...copy[zone], ...copy.common];
  const anchor = (index: number) => `help-${index + 1}`;

  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: back }} />}>
      {/* On a phone the header band ends right above: the first line keeps a gap from its edge. */}
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-4 md:pt-0">
        <div className="flex flex-col gap-4">
          <p className="px-1 text-callout text-ink-2">{copy.lead}</p>
          <ChipRow label={copy.contents}>
            {sections.map((section, index) => (
              <Chip key={section.title} href={`#${anchor(index)}`}>
                {section.title}
              </Chip>
            ))}
          </ChipRow>
        </div>
        {sections.map((section, index) => (
          <section key={section.title} aria-labelledby={anchor(index)} className="flex flex-col gap-1.5">
            <h2 id={anchor(index)} className="px-4 text-headline">
              {section.title}
            </h2>
            <div className="overflow-hidden rounded-lg bg-surface-1">
              {section.items.map((item) => (
                // Separator like ListRow's: a line above each question, clipped above the first one.
                <details
                  key={item.q}
                  className="group relative before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line"
                >
                  <summary className="flex min-h-13 cursor-pointer list-none items-center gap-3 px-4 py-3 text-body hover:bg-surface-3 focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">{item.q}</span>
                    <ChevronDown
                      aria-hidden
                      size={20}
                      strokeWidth={1.75}
                      className="shrink-0 text-ink-3 transition-transform duration-[var(--duration-instant)] group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <p className="px-4 pb-4 text-callout text-ink-2">{item.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
        <section aria-labelledby="help-ask" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
          <h2 id="help-ask" className="text-headline">
            {copy.askTitle}
          </h2>
          <p className="text-callout text-ink-2">{copy.askText}</p>
          <Button asChild variant="secondary" className="w-full md:w-fit">
            <Link href={`/feedback?from=${encodeURIComponent(helpPath(zone))}`}>{copy.askAction}</Link>
          </Button>
        </section>
      </div>
    </Screen>
  );
}
