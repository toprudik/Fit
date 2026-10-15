"use client";

import { User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/components/account/account-store";
import { DaMark } from "@/components/brand/da-mark";
import { PersonAvatar } from "@/components/ui/avatar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/client";
import { tabsForZone, ZONES, type TabId, type Zone } from "@/lib/navigation/zones";
import { cn } from "@/lib/utils";
import { TAB_ICONS, tabLabel } from "./nav-items";
import type { TabSelectHandler } from "./tab-bar";
import { useMediaQuery } from "./use-media-query";

// Tailwind's xl breakpoint: from here on the menu shows its labels, so tooltips would only repeat them.
const EXPANDED_QUERY = "(min-width: 80rem)";

type SideNavProps = {
  zone: Zone;
  /** Tab of the current screen; null when the screen belongs to none. */
  activeId: TabId | null;
  onSelect?: TabSelectHandler;
  onOpenProfile: () => void;
};

/**
 * Side menu from 768px on (docs/architecture/screens.md §1.1), in place of the tab bar. Up to 1279px
 * it is a narrow column of icons with tooltips; from 1280px it shows the name, the account, the zone
 * switch and labelled sections, as in docs/design/mockups/desktop-*.png.
 */
export function SideNav({ zone, activeId, onSelect, onOpenProfile }: SideNavProps) {
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
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );

  return (
    <div
      className={cn(
        "sticky top-0 hidden h-dvh w-20 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-bg px-3 md:flex xl:w-58",
        "pt-[max(var(--space-6),var(--safe-top))] pb-[max(var(--space-6),var(--safe-bottom))]",
      )}
    >
      <div className="flex h-11 items-center justify-center gap-2.5 xl:justify-start xl:px-2.5">
        <DaMark className="size-6" />
        <span className="hidden text-title-3 font-bold xl:inline">{t.meta.appName}</span>
      </div>

      {labelled(
        accountLabel,
        <button
          type="button"
          onClick={onOpenProfile}
          className={cn(
            "flex min-h-13 w-full cursor-pointer items-center justify-center gap-3 rounded-sm px-1 text-left xl:justify-start xl:px-2",
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
          <span className="sr-only xl:not-sr-only xl:line-clamp-2 xl:min-w-0 xl:text-headline">{accountLabel}</span>
        </button>,
      )}

      <SegmentedControl
        options={zoneOptions}
        value={zone}
        onValueChange={(next) => router.push(`/${next}`)}
        label={t.zones.label}
        className="hidden xl:grid"
      />

      <nav aria-label={t.nav.sections}>
        <ul className="flex flex-col gap-1">
          {tabsForZone(zone).map((tab) => {
            const Icon = TAB_ICONS[tab.icon];
            const active = tab.id === activeId;
            const label = tabLabel(t, tab.id);
            return (
              <li key={tab.id}>
                {labelled(
                  label,
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    onNavigate={onSelect ? (event) => onSelect(tab, event) : undefined}
                    className={cn(
                      "flex h-11 items-center justify-center gap-3 rounded-sm text-callout text-ink select-none",
                      "xl:justify-start xl:px-3",
                      "transition-[scale,background-color] duration-[var(--duration-instant)] ease-standard active:scale-[0.97]",
                      "motion-reduce:transition-none motion-reduce:active:scale-100",
                      active ? "bg-surface-1 font-semibold" : "hover:bg-surface-3",
                    )}
                  >
                    <Icon
                      aria-hidden
                      size={24}
                      strokeWidth={active ? 2.25 : 1.75}
                      className={cn("shrink-0", active && "text-accent-ink")}
                    />
                    <span className="sr-only xl:not-sr-only xl:min-w-0 xl:truncate">{label}</span>
                  </Link>,
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
