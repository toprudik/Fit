import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PriceGridItem } from "@/lib/packages/present";
import { cn } from "@/lib/utils";

/**
 * The price grid as clients see it (PRD wave-1 §2.8 rule 2, screens.md §2.2 and §3.1): each pack with its
 * price, the price per session, the saving and one "Выгоднее всего". Used on the showcase, in the trainer's
 * preview and in the template form, so all three look the same.
 */
export function PriceGrid({ items, bestLabel, className }: { items: PriceGridItem[]; bestLabel: string; className?: string }) {
  return (
    <ul className={cn("flex flex-col overflow-hidden rounded-lg bg-surface-1", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-start justify-between gap-3 border-t border-line px-4 py-3 first:border-t-0">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body break-words">{item.title}</span>
            {item.perSession || item.validity ? (
              <span className="text-footnote text-ink-2">{[item.perSession, item.validity].filter(Boolean).join(" · ")}</span>
            ) : null}
            {item.best ? (
              <Badge tone="accent" icon={Sparkles} className="mt-1 self-start">
                {bestLabel}
              </Badge>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-headline tabular-nums">{item.price}</span>
            {item.savings ? <span className="text-footnote text-success tabular-nums">{item.savings}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
