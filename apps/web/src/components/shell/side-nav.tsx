"use client";

import { Settings, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HoverCard } from "radix-ui";
import { useLayoutEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/account-store";
import { DaMark } from "@/components/brand/da-mark";
import { PersonAvatar } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/client";
import { tabsForZone, ZONES, type TabId, type Zone } from "@/lib/navigation/zones";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { TAB_ICONS, tabLabel, TRAINER_HELP_ITEM, TRAINER_MORE_ITEMS, type MoreItem } from "./nav-items";
import type { TabSelectHandler } from "./tab-bar";

// Tailwind's xl breakpoint: from here on the menu shows its labels, so tooltips would only repeat them.
const EXPANDED_QUERY = "(min-width: 80rem)";

type SideNavProps = {
  /** Zone whose sections are listed; null while unknown (settings opened directly, before hydration). */
  zone: Zone | null;
  /** Tab of the current screen; null when the screen belongs to none. */
  activeId: TabId | null;
  /** First path segment under the zone (["exercises"] → "exercises"): marks the «Ещё» section that is open. */
  segment?: string | null;
  /** The settings screen is open: its item is the current page. */
  settingsActive?: boolean;
  onSelect?: TabSelectHandler;
  /** Called when the Настройки item starts a navigation, so the shell treats it like a tab switch. */
  onSelectSettings?: () => void;
  onOpenProfile: () => void;
};

/**
 * Radix opens a tooltip on any focus. Only keyboard focus should open it, not the focus a dialog puts
 * back on its opener after a mouse closed it.
 */
function onlyOnKeyboardFocus(event: React.FocusEvent<HTMLElement>) {
  if (!event.currentTarget.matches(":focus-visible")) event.preventDefault();
}

type NavItemProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onNavigate?: (event: { preventDefault: () => void }) => void;
};

/** One row of the side menu: 44px and the 2px gap under it. */
const ITEM_PITCH = 46;

const MORE_ITEMS: readonly MoreItem[] = [...TRAINER_MORE_ITEMS, TRAINER_HELP_ITEM];

/**
 * How many of the trainer's «Ещё» sections fit in the menu's column above Настройки, given the room
 * the column has (`room`, in px) and the number of zone sections always shown before them. When some
 * don't fit, the last row goes to «Ещё», which lists the rest.
 */
export function fittingMoreItems(room: number, shown: number, total: number): number {
  // The last row has no gap under it.
  const rows = Math.floor((room + 2) / ITEM_PITCH);
  if (shown + total <= rows) return total;
  return Math.max(0, rows - shown - 1);
}

/**
 * Side menu from 768px on (docs/architecture/screens.md §1.1), in place of the tab bar. Up to 1279px
 * it is a narrow column of icons with tooltips; from 1280px it shows the name, the account, the zone
 * switch and the zone's sections with labels, as in docs/design/mockups/desktop-*.png. Settings sit
 * at the bottom in both.
 *
 * A trainer's «Ещё» sections (Профиль тренера, QR и ссылка, …) follow the zone's sections directly,
 * one click away, as many as the screen's height allows. Those that don't fit stay under the last
 * item, «Ещё»: hovering it lists them, and a click opens the «Ещё» screen.
 */
export function SideNav({ zone, activeId, segment = null, settingsActive = false, onSelect, onSelectSettings, onOpenProfile }: SideNavProps) {
  const { t } = useI18n();
  const router = useRouter();
  const account = useAccount();
  const expanded = useMediaQuery(EXPANDED_QUERY);

  const signedIn = account.status === "signed-in";
  // The button opens the profile sheet (sign-in lives there), so a signed-out user sees "Профиль" too.
  const accountLabel = signedIn && account.name ? account.name : t.common.profile;
  const zoneOptions = ZONES.map((value) => ({ value, label: t.zones[value] }));

  const extras = zone === "trainer" ? MORE_ITEMS : [];
  const mainTabs = zone ? tabsForZone(zone).filter((tab) => !(zone === "trainer" && tab.id === "more")) : [];
  const moreTab = zone === "trainer" ? tabsForZone(zone).find((tab) => tab.id === "more") : undefined;

  // Until the column is measured (and in the first paint) the «Ещё» sections stay under «Ещё», as on a phone.
  const [fitting, setFitting] = useState(0);
  const roomRef = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room || extras.length === 0 || typeof ResizeObserver === "undefined") return;
    const measure = () => setFitting(fittingMoreItems(room.clientHeight, mainTabs.length, extras.length));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return () => observer.disconnect();
  }, [extras.length, mainTabs.length]);

  const shownExtras = extras.slice(0, fitting);
  const hiddenExtras = extras.slice(fitting);
  const extraActive = (item: MoreItem) => zone === "trainer" && segment === item.segment;

  // Narrow menu: labels are visually hidden, so a tooltip shows them on hover and keyboard focus.
  const labelled = (label: string, trigger: React.ReactElement) =>
    expanded ? (
      trigger
    ) : (
      <Tooltip>
        <TooltipTrigger asChild onFocus={onlyOnKeyboardFocus}>
          {trigger}
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );

  const navLink = ({ href, label, icon: Icon, active, onNavigate }: NavItemProps) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onNavigate={onNavigate}
      className={cn(
        "flex h-11 items-center justify-center gap-3 rounded-sm text-subhead text-ink select-none",
        "xl:justify-start xl:px-3",
        "transition-[scale,background-color] duration-[var(--duration-instant)] ease-standard active:scale-[0.97]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
        active ? "bg-surface-1 font-semibold" : "font-medium hover:bg-surface-3",
      )}
    >
      <Icon aria-hidden size={24} strokeWidth={active ? 2.25 : 1.75} className={cn("shrink-0", active && "text-accent-ink")} />
      <span className="sr-only xl:not-sr-only xl:min-w-0 xl:truncate">{label}</span>
    </Link>
  );
  const navItem = (props: NavItemProps) => labelled(props.label, navLink(props));

  return (
    <div
      className={cn(
        "sticky top-0 hidden h-dvh w-20 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-bg px-3 md:flex xl:w-58",
        "pt-[max(var(--space-3),var(--safe-top))] pb-[max(var(--space-4),var(--safe-bottom))]",
      )}
    >
      {/* A 4px gap down to the account, as in the mockup; 20px from the zone switch to the sections. */}
      <div className="-mb-3 flex h-11 shrink-0 items-center justify-center gap-2.5 xl:justify-start xl:px-2.5">
        <DaMark className="size-7.5" />
        <span className="hidden text-title-3 font-bold xl:inline">{t.meta.appName}</span>
      </div>

      {labelled(
        accountLabel,
        <button
          type="button"
          onClick={onOpenProfile}
          className={cn(
            "flex min-h-13 w-full shrink-0 cursor-pointer items-center justify-center gap-3 rounded-sm px-1 text-left xl:justify-start xl:px-2",
            "transition-[scale,background-color] duration-[var(--duration-instant)] ease-standard hover:bg-surface-3 active:scale-[0.97]",
            "motion-reduce:transition-none motion-reduce:active:scale-100",
          )}
        >
          <PersonAvatar
            name={signedIn ? account.name : ""}
            src={signedIn ? account.photoUrl : null}
            size={36}
            decorative
            // While the session loads the circle stays empty instead of flashing the signed-out icon.
            fallbackIcon={account.status === "loading" ? undefined : User}
          />
          {/* Two lines rather than an ellipsis for a long name. */}
          <span className="sr-only xl:not-sr-only xl:line-clamp-2 xl:min-w-0 xl:text-subhead xl:font-semibold">{accountLabel}</span>
        </button>,
      )}

      {/* The switch is only for trainers, who have both zones (PAIR-3). */}
      {zone && signedIn && account.isTrainer ? (
        <SegmentedControl
          options={zoneOptions}
          value={zone}
          onValueChange={(next) => router.push(`/${next}`)}
          label={t.zones.label}
          className="hidden shrink-0 xl:grid"
        />
      ) : null}

      <nav aria-label={t.nav.sections} className="mt-1 flex min-h-0 flex-1 flex-col">
        {/* Until the zone is known (settings opened directly) the frame shows no zone's sections. */}
        {zone ? (
          // Grows into the column's free room, which is what it measures; overflow stays hidden until it does.
          <ul
            ref={roomRef}
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden"
            // The zone's sections and «Ещё» always stay; on a very short screen the whole menu scrolls instead.
            style={extras.length > 0 ? { minHeight: (mainTabs.length + 1) * ITEM_PITCH - 2 } : undefined}
          >
            {mainTabs.map((tab) => (
              <li key={tab.id}>
                {navItem({
                  href: tab.href,
                  label: tabLabel(t, tab.id),
                  icon: TAB_ICONS[tab.icon],
                  active: tab.id === activeId,
                  onNavigate: onSelect ? (event) => onSelect(tab, event) : undefined,
                })}
              </li>
            ))}
            {shownExtras.map((item) => (
              <li key={item.href}>{navItem({ href: item.href, label: item.title(t), icon: item.icon, active: extraActive(item) })}</li>
            ))}
            {moreTab && hiddenExtras.length > 0 ? (
              <li>
                <HoverCard.Root openDelay={80} closeDelay={150}>
                  {/* The card names the item in the narrow menu, so it needs no tooltip of its own. */}
                  <HoverCard.Trigger asChild>
                    {navLink({
                      href: moreTab.href,
                      label: tabLabel(t, moreTab.id),
                      icon: TAB_ICONS[moreTab.icon],
                      active: moreTab.id === activeId || hiddenExtras.some(extraActive),
                      onNavigate: onSelect ? (event) => onSelect(moreTab, event) : undefined,
                    })}
                  </HoverCard.Trigger>
                  <HoverCard.Portal>
                    <HoverCard.Content
                      side="right"
                      align="end"
                      sideOffset={8}
                      collisionPadding={8}
                      className="z-[var(--z-sheet)] max-h-[var(--radix-hover-card-content-available-height)] w-64 overflow-y-auto rounded-md bg-surface-1 p-1.5 shadow-float"
                    >
                      <p className="px-2.5 pt-1 pb-1.5 text-footnote text-ink-2 xl:hidden">{tabLabel(t, moreTab.id)}</p>
                      <ul className="flex flex-col gap-0.5">
                        {hiddenExtras.map((item) => {
                          const Icon = item.icon;
                          const active = extraActive(item);
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex h-10 items-center gap-3 rounded-sm px-2.5 text-subhead text-ink select-none",
                                  active ? "bg-surface-2 font-semibold" : "font-medium hover:bg-surface-3",
                                )}
                              >
                                <Icon aria-hidden size={20} strokeWidth={active ? 2.25 : 1.75} className={cn("shrink-0", active && "text-accent-ink")} />
                                <span className="min-w-0 truncate">{item.title(t)}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </HoverCard.Content>
                  </HoverCard.Portal>
                </HoverCard.Root>
              </li>
            ) : null}
          </ul>
        ) : null}
        <ul className="mt-auto flex flex-col pt-4">
          <li>
            {navItem({
              href: "/settings",
              label: t.profile.settings,
              icon: Settings,
              active: settingsActive,
              onNavigate: onSelectSettings ? () => onSelectSettings() : undefined,
            })}
          </li>
        </ul>
      </nav>
    </div>
  );
}
