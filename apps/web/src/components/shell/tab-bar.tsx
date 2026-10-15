"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { tabsForZone, type Tab, type TabId, type Zone } from "@/lib/navigation/zones";
import { cn } from "@/lib/utils";
import { TAB_ICONS, tabLabel } from "./nav-items";

/**
 * Called when a tab link starts a client-side navigation (not on Ctrl/Cmd-click, which opens a new
 * browser tab). The shell calls `preventDefault` and navigates itself to the tab's remembered screen.
 */
export type TabSelectHandler = (tab: Tab, event: { preventDefault: () => void }) => void;

type TabBarProps = {
  zone: Zone;
  /** Tab of the current screen; null when the screen belongs to none. */
  activeId: TabId | null;
  onSelect?: TabSelectHandler;
};

/**
 * Bottom tab bar of a zone on phones (docs/design/components/TabBar), five tabs at most. From 768px
 * on the side menu takes its place. The links point at the tab roots, so they also work without
 * JavaScript and in a new browser tab.
 */
export function TabBar({ zone, activeId, onSelect }: TabBarProps) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t.nav.sections}
      className={cn(
        "material fixed inset-x-0 bottom-0 z-[var(--z-tabbar)] border-t border-line md:hidden",
        "pr-[var(--safe-right)] pb-[var(--safe-bottom)] pl-[var(--safe-left)]",
      )}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {tabsForZone(zone).map((tab) => {
          const Icon = TAB_ICONS[tab.icon];
          const active = tab.id === activeId;
          return (
            <li key={tab.id} className="min-w-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                onNavigate={onSelect ? (event) => onSelect(tab, event) : undefined}
                className={cn(
                  // No side padding, as in .df-tab: at 360px a cell is 72px and «Расписание» needs all of it.
                  "group flex h-[var(--size-tabbar)] flex-col items-center justify-center gap-0.5",
                  "text-caption text-ink-3 select-none",
                  // The ring stays inside the cell: the bar sits on the screen edge.
                  "focus-visible:-outline-offset-2",
                  active && "font-semibold text-ink",
                )}
              >
                <Icon
                  aria-hidden
                  size={24}
                  strokeWidth={active ? 2.25 : 1.75}
                  className={cn(
                    "shrink-0 transition-transform duration-[var(--duration-instant)] ease-standard group-active:scale-90",
                    "motion-reduce:transition-none motion-reduce:group-active:scale-100",
                    active && "text-accent-ink",
                  )}
                />
                {/* The ellipsis is a last resort for a longer label or a larger system font. */}
                <span className="max-w-full truncate">{tabLabel(t, tab.id)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
