import Link from "next/link";
import { cn } from "@/lib/utils";

type PairTabsProps = {
  label: string;
  tabs: { href: string; label: string; current: boolean }[];
};

/**
 * Sections of a pair card as links (Обзор, Заметки ...), drawn like a SegmentedControl: each section has
 * its own URL, so a bot button or a shared link opens it directly. The current one is aria-current.
 */
export function PairTabs({ label, tabs }: PairTabsProps) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
      <ul className="flex w-max min-w-full gap-0 rounded-sm bg-surface-2 p-[3px] md:min-w-0">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex-1">
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={cn(
                "relative flex h-[38px] min-w-24 items-center justify-center rounded-xs px-4 text-subhead font-semibold whitespace-nowrap",
                "transition-[color,background-color] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none",
                // The visual segment is 38px tall inside the track; the hit area covers the full 44px.
                "before:absolute before:inset-x-0 before:-inset-y-[3px]",
                tab.current ? "bg-inverse text-on-inverse" : "text-ink-2 hover:bg-surface-3",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
