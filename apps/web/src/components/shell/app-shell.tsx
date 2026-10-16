"use client";

import { animate, type AnimationPlaybackControlsWithThen } from "motion/react";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProfileSheet } from "@/components/profile/profile-sheet";
import { useI18n } from "@/i18n/client";
import { DURATION, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";
import { activeTab, isTabRoot, isZone, ZONE_COOKIE, type TabId, type Zone } from "@/lib/navigation/zones";
import { preferenceCookie, saveAccountPreferences } from "@/lib/preferences";
import { hapticImpact } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";
import { arrival } from "./navigation-tracker";
import { ShellContext, type Shell } from "./shell-context";
import { SideNav } from "./side-nav";
import { TabBar, type TabSelectHandler } from "./tab-bar";
import { useShownZone } from "./use-shown-zone";

/** Where a tab was left: the top of its stack and how far it was scrolled. */
type TabMemory = { href: string; scrollY: number };

/** What the shell showed: the route below (zones), its zone and its tab. */
type Shown = { route: string; zone: Zone | null; tabId: TabId | null };

type Transition = "zone" | "tab" | "push" | "pop";

/** First segment of the settings screen, which the side menu lists as an item of its own. */
const SETTINGS_SEGMENT = "settings";

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
 * How the shell moved from one screen to the next (screens.md §1.3). Another zone crossfades the
 * frame; another tab crossfades the screen; anything else inside a zone is a push or, going back, a
 * pop. `intent` is what a tap in the tab bar or side menu asked for.
 */
function transitionBetween(before: Shown, after: Shown, intent: "tab" | "pop" | null): Transition | null {
  if (before.zone !== null && after.zone !== null && before.zone !== after.zone) return "zone";
  if (intent) return intent;
  if (before.tabId !== null && after.tabId !== null && before.tabId !== after.tabId) return "tab";
  const how = arrival();
  return how === "load" ? null : how;
}

/**
 * Plays a transition on the element: crossfades over duration-base (zone) or duration-fast (tab);
 * push brings the screen in from 30% of its width on the right and pop from 30% on the left, with a
 * fade, over duration-slow and without a spring (brand.md "Движение"). With reduced motion every one
 * is a fade of 100ms. The outgoing screen's parallax (it shifts a third aside and dims) is not done:
 * Next.js hides the old screen in the same commit that shows the new one.
 */
function play(element: HTMLElement, transition: Transition): AnimationPlaybackControlsWithThen {
  const reduced = prefersReducedMotion();
  const controls =
    reduced || transition === "zone" || transition === "tab"
      ? animate(
          element,
          { opacity: [0, 1] },
          { duration: reduced ? DURATION.instant : transition === "zone" ? DURATION.base : DURATION.fast, ease: EASE_STANDARD },
        )
      : animate(
          element,
          // Ends at `none`, not translateX(0): motion may commit the final value inline after the
          // cleanup below, and only `none` leaves position: fixed descendants tied to the viewport.
          { opacity: [0, 1], transform: [transition === "push" ? "translateX(30%)" : "translateX(-30%)", "none"] },
          { duration: DURATION.slow, ease: EASE_STANDARD },
        );
  void controls.then(() => {
    element.style.removeProperty("transform");
    element.style.removeProperty("opacity");
  });
  return controls;
}

/**
 * Frame of every screen in the (zones) group (docs/architecture/screens.md §1): the tab bar on
 * phones, the side menu from 768px on, the profile sheet behind the avatar, and the transitions
 * between screens. Settings and the profile page live here too, so the side menu stays on wider
 * screens; on phones they are pushed screens without the tab bar.
 *
 * Each tab keeps its own stack and scroll position: switching tabs returns to the screen and the
 * scroll where the tab was left. Tapping the current tab goes back to its root, or scrolls up when
 * already there. The transitions animate the existing DOM imperatively instead of keying it, so
 * screens are never remounted and keep their state.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  // Segments below the (zones) group: ["trainer"], ["client", "sessions"], ["settings"], …
  const segments = useSelectedLayoutSegments();
  const [first, ...rest] = segments;
  const route = segments.join("/");
  const routeZone: Zone | null = isZone(first) ? first : null;
  const zone = useShownZone(routeZone);
  const tabId: TabId | null = routeZone ? (activeTab(routeZone, rest)?.id ?? null) : null;
  const atTabRoot = routeZone !== null && isTabRoot(routeZone, rest);

  // The sheet belongs to the screen it was opened over: any navigation closes it, whoever started it.
  const [profileRoute, setProfileRoute] = useState<string | null>(null);
  if (profileRoute !== null && profileRoute !== route) setProfileRoute(null);
  const profileOpen = profileRoute === route;
  // Read by the handlers below, which stay the same across navigations (and so does the context).
  const shownRoute = useRef(route);
  useLayoutEffect(() => {
    shownRoute.current = route;
  }, [route]);
  const openProfile = useCallback(() => setProfileRoute(shownRoute.current), []);
  const setProfileOpen = useCallback((open: boolean) => setProfileRoute(open ? shownRoute.current : null), []);
  const shell = useMemo<Shell>(() => ({ zone, openProfile }), [zone, openProfile]);

  // "/" opens the last zone. The proxy remembers it on page requests, but a client navigation to a
  // prefetched screen may never reach the server, so the shell remembers zone changes too. Not on
  // the first render: the page request already set it, and a late hydration of the page being left
  // would overwrite the zone the proxy just saved for the next one. Screens without a zone keep it.
  const savedZone = useRef(routeZone);
  useEffect(() => {
    if (routeZone === null || routeZone === savedZone.current) return;
    savedZone.current = routeZone;
    document.cookie = preferenceCookie(ZONE_COOKIE, routeZone);
    void saveAccountPreferences({ lastZone: routeZone });
  }, [routeZone]);

  const frameRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const memory = useRef(new Map<TabId, TabMemory>());
  const pendingScroll = useRef<number | null>(null);
  const intent = useRef<"tab" | "pop" | null>(null);

  // The side menu's Настройки is a destination like a tab (screens.md §1.3): crossfade, and the tab
  // being left keeps its screen and scroll for the way back.
  const selectSettings = () => {
    if (tabId) memory.current.set(tabId, { href: currentUrl(), scrollY: window.scrollY });
    intent.current = "tab";
  };

  const selectTab: TabSelectHandler = (tab, event) => {
    event.preventDefault();
    if (tab.id === tabId) {
      if (atTabRoot) {
        scrollToTop(mainRef.current);
        return;
      }
      // Back to the root of the current tab: its stack starts over, and the screen goes back like a pop.
      memory.current.delete(tab.id);
      pendingScroll.current = 0;
      intent.current = "pop";
      router.push(tab.href, { scroll: false });
      return;
    }
    if (tabId) memory.current.set(tabId, { href: currentUrl(), scrollY: window.scrollY });
    const saved = memory.current.get(tab.id);
    pendingScroll.current = saved?.scrollY ?? 0;
    intent.current = "tab";
    hapticImpact();
    router.push(saved?.href ?? tab.href, { scroll: false });
  };

  // Restores the scroll of a tab switch once its screen is in the DOM, before it is painted.
  useLayoutEffect(() => {
    const top = pendingScroll.current;
    if (top === null) return;
    pendingScroll.current = null;
    window.scrollTo({ top, behavior: "instant" });
  }, [route]);

  // A layout effect starts the transition before the browser paints the new screen, so it never
  // flashes in place. The first load and a reload show the screen at once.
  const shown = useRef<Shown>({ route, zone, tabId });
  const running = useRef<AnimationPlaybackControlsWithThen | null>(null);
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { route, zone, tabId };
    // The zone of settings opened directly arrives after hydration: no navigation, nothing to play.
    if (before.route === route) return;
    const asked = intent.current;
    intent.current = null;
    const transition = transitionBetween(before, shown.current, asked);
    const target = transition === "zone" ? frameRef.current : screenRef.current;
    if (!transition || !target) return;
    // Finishing the previous transition first guarantees nothing is left half transparent or shifted.
    // Only one still running: complete() on finished controls would restart a filled animation.
    running.current?.complete();
    const controls = play(target, transition);
    running.current = controls;
    void controls.then(() => {
      if (running.current === controls) running.current = null;
    });
  }, [route, zone, tabId]);

  // Next.js hides the shell (React Activity) when a navigation leaves it, e.g. for sign-in.
  useLayoutEffect(() => () => running.current?.complete(), []);

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
        <SideNav
          zone={zone}
          activeId={tabId}
          settingsActive={first === SETTINGS_SEGMENT}
          onSelect={selectTab}
          onSelectSettings={selectSettings}
          onOpenProfile={openProfile}
        />
        {/*
         * Focus target of the skip link only, so it shows no ring. `clip` keeps a sliding screen from
         * widening the page or covering the side menu, and unlike `hidden` makes no scroll container,
         * so the header bar still sticks.
         */}
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={cn(
            "min-w-0 flex-1 overflow-x-clip outline-none md:pb-0",
            routeZone ? "pb-[calc(var(--size-tabbar)+var(--safe-bottom))]" : "pb-[var(--safe-bottom)]",
          )}
        >
          <div ref={screenRef}>{children}</div>
        </main>
        {/* Settings and the profile page are pushed screens on a phone: no tab bar there. */}
        {routeZone ? <TabBar zone={routeZone} activeId={tabId} onSelect={selectTab} /> : null}
      </div>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
    </ShellContext>
  );
}
