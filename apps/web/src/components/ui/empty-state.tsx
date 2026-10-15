import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  /** What will appear here. */
  title: string;
  /** How to get it. */
  description?: string;
  /** At most one action, usually a `Button`. */
  action?: React.ReactNode;
  /** h2 on a screen under its h1; h3 when the empty state sits inside a titled section. */
  headingLevel?: 2 | 3;
  className?: string;
};

/** Empty screen or section that points to the next step (docs/design/components/EmptyState). */
export function EmptyState({ icon: Icon, title, description, action, headingLevel = 2, className }: EmptyStateProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center gap-3 px-6 py-10 text-center", className)}>
      <div aria-hidden className="mb-1 grid size-16 place-items-center rounded-lg bg-surface-1 text-accent-ink">
        <Icon size={28} strokeWidth={1.75} />
      </div>
      <Heading className="text-title-3 text-balance">{title}</Heading>
      {description ? <p className="mb-2 max-w-[300px] text-subhead text-pretty text-ink-2">{description}</p> : null}
      {action}
    </div>
  );
}
