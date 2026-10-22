"use client";

import { User } from "lucide-react";
import Link from "next/link";
import { useAccount } from "@/components/account/account-store";
import { PersonAvatar } from "@/components/ui/avatar";
import { useI18n } from "@/i18n/client";
import { tabsForZone, type Tab, type TabId, type Zone } from "@/lib/navigation/zones";
import { cn } from "@/lib/utils";
import { TAB_ICONS, tabLabel } from "./nav-items";
import { useKeyboardOpen } from "./use-keyboard-open";

/**
 * Called when a tab link starts a client-side navigation (not on Ctrl/Cmd-click, which opens a new
 * browser tab). The shell calls `preventDefault` and navigates itself to the tab's remembered screen.
 */
export type TabSelectHandler = (tab: Tab, event: { preventDefault: () => void }) => void;

type TabBarProps = {
  zone: Zone;
  /** Tab of the current screen; null when the screen belongs to none. */
  activeId: TabId | null;
  /** Tab that shows the avatar and «Профиль» instead of its own icon and label (PROFILE_TAB). */
  profileId?: TabId | null;
  onSelect?: TabSelectHandler;
};

/**
 * Bottom tab bar of a zone on phones (docs/design/components/TabBar), five tabs at most. From 768px
 * on the side menu takes its place. It steps aside while the on-screen keyboard is up. The links point at the tab roots, so they also work without
 * JavaScript and in a new browser tab.
 */
export function TabBar({ zone, activeId, profileId = null, onSelect }: TabBarProps) {
  const { t } = useI18n();
  const account = useAccount();
  const signedIn = account.status === "signed-in";
  // Fixed to the bottom, the bar would ride up on the keyboard and cover the field being typed in.
  const keyboardOpen = useKeyboardOpen();

  return (
    <nav
      aria-label={t.nav.sections}
      hidden={keyboardOpen}
      className={cn(
        "material fixed inset-x-0 bottom-0 z-[var(--z-tabbar)] border-t border-line md:hidden",
        "pr-[var(--safe-right)] pb-[var(--safe-bottom)] pl-[var(--safe-left)]",
      )}
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {tabsForZone(zone).map((tab) => {
          const Icon = TAB_ICONS[tab.icon];
          const active = tab.id === activeId;
          const profile = tab.id === profileId;
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
                {profile ? (
                  <PersonAvatar
                    name={signedIn ? account.name : ""}
                    src={signedIn ? account.photoUrl : null}
                    size={28}
                    decorative
                    fallbackIcon={account.status === "loading" ? undefined : User}
                    className={cn(
                      // 24px like the icons; the selected tab rings its avatar in the accent color.
                      "size-6 text-[10px] ring-offset-2 ring-offset-surface-1",
                      active && "ring-2 ring-accent-ink",
                    )}
                  />
                ) : (
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
                )}
                {/* The ellipsis is a last resort for a longer label or a larger system font. */}
                <span className="max-w-full truncate">{profile ? t.common.profile : tabLabel(t, tab.id)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
