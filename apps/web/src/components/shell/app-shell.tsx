"use client";

import { animate, type AnimationPlaybackControlsWithThen } from "motion/react";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProfileSheet } from "@/components/profile/profile-sheet";
import { useI18n } from "@/i18n/client";
import { activeTab, DEFAULT_ZONE, isTabRoot, isZone, ZONE_COOKIE, type TabId, type Zone } from "@/lib/navigation/zones";
import { preferenceCookie } from "@/lib/preferences";
import { hapticImpact } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";
import { DURATION, EASE_STANDARD, prefersReducedMotion } from "./motion";
import { ShellContext, type Shell } from "./shell-context";
import { SideNav } from "./side-nav";
import { TabBar, type TabSelectHandler } from "./tab-bar";

export { useShell, type Shell } from "./shell-context";

/** Where a tab was left: the top of its stack and how far it was scrolled. */
type TabMemory = { href: string; scrollY: number };

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

/** Scrolls the page, and the list and detail columns on a desktop, back to the top. */
function scrollToTop(main: HTMLElement | null) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "instant" : "smooth";
  window.scrollTo({ top: 0, behavior });
  for (const column of main?.querySelectorAll<HTMLElement>("[data-scroll-column]") ?? []) column.scrollTo({ top: 0, behavior });
}

/**
 * Frame of every zone screen (docs/architecture/screens.md §1): the tab bar on phones, the side menu
 * from 768px on, the profile sheet behind the avatar, and the transitions between tabs and zones.
 *
 * Each tab keeps its own stack and scroll position: switching tabs returns to the screen and the
 * scroll where the tab was left. Tapping the current tab goes back to its root, or scrolls up when
 * already there. The transitions animate the existing DOM imperatively instead of keying it, so
 * screens are never remounted and keep their state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  // Segments below the (zones) group: ["trainer"], ["client", "sessions"], …
  const segments = useSelectedLayoutSegments();
  const [first, ...rest] = segments;
  const zone: Zone = isZone(first) ? first : DEFAULT_ZONE;
  const tabId: TabId | null = activeTab(zone, rest)?.id ?? null;
  const atTabRoot = isTabRoot(zone, rest);

  const [profileOpen, setProfileOpen] = useState(false);
  const openProfile = useCallback(() => setProfileOpen(true), []);
  const shell = useMemo<Shell>(() => ({ zone, openProfile }), [zone, openProfile]);

  // "/" opens the last zone. The proxy remembers it on page requests, but a client navigation to a
  // prefetched screen may never reach the server, so the shell remembers zone changes too. Not on
  // the first render: the page request already set it, and a late hydration of the page being left
  // would overwrite the zone the proxy just saved for the next one.
  const loadedZone = useRef(zone);
  useEffect(() => {
    if (zone === loadedZone.current) return;
    loadedZone.current = zone;
    document.cookie = preferenceCookie(ZONE_COOKIE, zone);
  }, [zone]);

  const frameRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const memory = useRef(new Map<TabId, TabMemory>());
  const pendingScroll = useRef<number | null>(null);

  const selectTab: TabSelectHandler = (tab, event) => {
    event.preventDefault();
    if (tab.id === tabId) {
      if (atTabRoot) {
        scrollToTop(mainRef.current);
        return;
      }
      // Back to the root of the current tab: its stack starts over.
      memory.current.delete(tab.id);
      pendingScroll.current = 0;
      router.push(tab.href, { scroll: false });
      return;
    }
    if (tabId) memory.current.set(tabId, { href: currentUrl(), scrollY: window.scrollY });
    const saved = memory.current.get(tab.id);
    pendingScroll.current = saved?.scrollY ?? 0;
    hapticImpact();
    router.push(saved?.href ?? tab.href, { scroll: false });
  };

  // Restores the scroll of a tab switch once its screen is in the DOM, before it is painted.
  const route = segments.join("/");
  useLayoutEffect(() => {
    const top = pendingScroll.current;
    if (top === null) return;
    pendingScroll.current = null;
    window.scrollTo({ top, behavior: "instant" });
  }, [route]);

  // Tab change: the screen fades in over duration-fast without moving. Zone change: the whole frame
  // fades in over duration-base, as the tab bar and menu are rebuilt. Reduced motion: 100ms at most.
  const shown = useRef({ zone, tabId });
  const fade = useRef<AnimationPlaybackControlsWithThen | null>(null);
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { zone, tabId };
    if (before.zone === zone && before.tabId === tabId) return;
    const zoneChanged = before.zone !== zone;
    const target = zoneChanged ? frameRef.current : mainRef.current;
    if (!target) return;
    const duration = prefersReducedMotion() ? DURATION.instant : zoneChanged ? DURATION.base : DURATION.fast;
    // Finishing the previous fade first guarantees nothing is left half transparent.
    fade.current?.complete();
    fade.current = animate(target, { opacity: [0, 1] }, { duration, ease: EASE_STANDARD });
  }, [zone, tabId]);

  return (
    <ShellContext value={shell}>
      <a
        href="#main"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:top-[calc(var(--safe-top)+var(--space-2))] focus:left-4",
          "focus:z-[var(--z-toast)] focus:rounded-sm focus:bg-inverse focus:px-4 focus:py-2.5",
          "focus:text-subhead focus:font-semibold focus:text-on-inverse",
        )}
      >
        {t.common.skipToContent}
      </a>
      <div ref={frameRef} className="min-h-dvh pr-[var(--safe-right)] pl-[var(--safe-left)] md:flex">
        <SideNav zone={zone} activeId={tabId} onSelect={selectTab} onOpenProfile={openProfile} />
        {/* Focus target of the skip link only, so it shows no ring. */}
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1 pb-[calc(var(--size-tabbar)+var(--safe-bottom))] outline-none md:pb-0"
        >
          {children}
        </main>
        <TabBar zone={zone} activeId={tabId} onSelect={selectTab} />
      </div>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
    </ShellContext>
  );
}
