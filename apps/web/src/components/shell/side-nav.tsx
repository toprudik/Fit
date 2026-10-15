"use client";

import { Settings, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/account/account-store";
import { DaMark } from "@/components/brand/da-mark";
import { PersonAvatar } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/client";
import { tabsForZone, ZONES, type TabId, type Zone } from "@/lib/navigation/zones";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { TAB_ICONS, tabLabel } from "./nav-items";
import type { TabSelectHandler } from "./tab-bar";

// Tailwind's xl breakpoint: from here on the menu shows its labels, so tooltips would only repeat them.
const EXPANDED_QUERY = "(min-width: 80rem)";

type SideNavProps = {
  /** Zone whose sections are listed; null while unknown (settings opened directly, before hydration). */
  zone: Zone | null;
  /** Tab of the current screen; null when the screen belongs to none. */
  activeId: TabId | null;
  /** The settings screen is open: its item is the current page. */
  settingsActive?: boolean;
  onSelect?: TabSelectHandler;
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

/**
 * Side menu from 768px on (docs/architecture/screens.md §1.1), in place of the tab bar. Up to 1279px
 * it is a narrow column of icons with tooltips; from 1280px it shows the name, the account, the zone
 * switch and the zone's sections with labels, as in docs/design/mockups/desktop-*.png. Settings sit
 * at the bottom in both.
 */
export function SideNav({ zone, activeId, settingsActive = false, onSelect, onOpenProfile }: SideNavProps) {
  const { t } = useI18n();
  const router = useRouter();
  const account = useAccount();
  const expanded = useMediaQuery(EXPANDED_QUERY);

  const signedIn = account.status === "signed-in";
  // The button opens the profile sheet (sign-in lives there), so a signed-out user sees "Профиль" too.
  const accountLabel = signedIn && account.name ? account.name : t.common.profile;
  const zoneOptions = ZONES.map((value) => ({ value, label: t.zones[value] }));

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

  const navItem = ({ href, label, icon: Icon, active, onNavigate }: NavItemProps) =>
    labelled(
      label,
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
      </Link>,
    );

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

      {zone ? (
        <SegmentedControl
          options={zoneOptions}
          value={zone}
          onValueChange={(next) => router.push(`/${next}`)}
          label={t.zones.label}
          className="hidden shrink-0 xl:grid"
        />
      ) : null}

      <nav aria-label={t.nav.sections} className="mt-1 flex flex-1 flex-col">
        {/* Until the zone is known (settings opened directly) the frame shows no zone's sections. */}
        {zone ? (
          <ul className="flex flex-col gap-0.5">
            {tabsForZone(zone).map((tab) => (
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
          </ul>
        ) : null}
        <ul className="mt-auto flex flex-col pt-4">
          <li>{navItem({ href: "/settings", label: t.profile.settings, icon: Settings, active: settingsActive })}</li>
        </ul>
      </nav>
    </div>
  );
}
