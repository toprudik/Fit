"use client";

import { animate } from "motion/mini";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProfileSheet } from "@/components/profile/profile-sheet";
import { useI18n } from "@/i18n/client";
import { DURATION, EASE_STANDARD, prefersReducedMotion } from "@/lib/motion";
import { activeTab, isTabRoot, isZone, tabsForZone, ZONE_COOKIE, type TabId, type Zone } from "@/lib/navigation/zones";
import { preferenceCookie, saveAccountPreferences } from "@/lib/preferences";
import { hapticImpact, useTelegramTopControls } from "@/lib/telegram/mini-app";
import { cn } from "@/lib/utils";
import { PROFILE_TAB, tabLabel } from "./nav-items";
import { arrival, openTab, stepsBackToHome } from "./navigation-tracker";
import { Screen } from "./screen";
import { ScreenHeader } from "./screen-header";
import { ShellContext, type Shell } from "./shell-context";
import { SideNav } from "./side-nav";
import { TabBar, type TabSelectHandler } from "./tab-bar";
import { PENDING_SKELETONS } from "./tab-skeletons";
import { TodayDate } from "./today-date";
import { useShownZone } from "./use-shown-zone";

/** Where a tab was left: the top of its stack and how far it was scrolled. */
type TabMemory = { href: string; scrollY: number };

/** What the shell showed: the route below (zones), its zone and its tab. */
type Shown = { route: string; zone: Zone | null; tabId: TabId | null };

type Transition = "zone" | "tab" | "push" | "pop";

/** How long a tapped tab may take before the shell shows its skeleton: the skeletons' own 300 ms. */
const SKELETON_DELAY_MS = 300;

/** Tabs whose header carries today's date under the title. */
const DATED_TABS: ReadonlySet<TabId> = new Set(["today", "home"]);

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

/** The controls motion's WAAPI animate() returns. */
type Playback = ReturnType<typeof animate>;

/**
 * Plays a transition on the element: crossfades over duration-base (zone);
 * push brings the screen in from 30% of its width on the right and pop from 30% on the left, with a
 * fade, over duration-slow and without a spring (brand.md "Движение"). With reduced motion every one
 * is a fade of 100ms. The outgoing screen's parallax (it shifts a third aside and dims) is not done:
 * Next.js hides the old screen in the same commit that shows the new one.
 */
function play(element: HTMLElement, transition: Transition): Playback {
  const reduced = prefersReducedMotion();
  const controls =
    reduced || transition === "zone"
      ? animate(element, { opacity: [0, 1] }, { duration: reduced ? DURATION.instant : DURATION.base, ease: EASE_STANDARD })
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
 * screens and the tab bar on phones.
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
  // Under Telegram's buttons the header has no room for the avatar, so the profile moves to a tab.
  const profileTabId = useTelegramTopControls() && zone ? PROFILE_TAB[zone] : null;
  const onProfileTab = atTabRoot && profileTabId !== null && tabId === profileTabId;

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
  const shell = useMemo<Shell>(() => ({ zone, openProfile, onProfileTab }), [zone, openProfile, onProfileTab]);

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

  // The tapped tab lights up at once, before its screen arrives: a screen not fetched yet can take a
  // second or more, and an unlit tab reads as a lost tap. The next route clears it.
  const [pendingTab, setPendingTab] = useState<{ id: TabId; from: string } | null>(null);
  if (pendingTab !== null && pendingTab.from !== route) setPendingTab(null);
  // Settings, the profile page and the rest outside the zones belong to the profile tab in the Mini App.
  const shownTabId = pendingTab?.id ?? tabId ?? (routeZone === null ? profileTabId : null);

  // A screen that has not arrived after 300 ms (the first tap after opening, before its prefetch is
  // in) gets its skeleton from the shell, under the tab's title, instead of the old screen standing
  // still. The arriving screen then shows its own skeleton at once (data-skeleton-instant on <main>)
  // rather than after another 300 ms; that lasts until the next navigation.
  const [skeleton, setSkeleton] = useState<{ from: string; at: string | null } | null>(null);
  if (skeleton !== null && skeleton.at === null && skeleton.from !== route) setSkeleton({ from: skeleton.from, at: route });
  if (skeleton !== null && skeleton.at !== null && skeleton.at !== route) setSkeleton(null);
  useEffect(() => {
    if (pendingTab === null) return;
    const { from } = pendingTab;
    const timer = window.setTimeout(() => setSkeleton({ from, at: null }), SKELETON_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pendingTab]);
  const waitingTab = pendingTab !== null && skeleton?.at === null && skeleton.from === route ? pendingTab.id : null;

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
    setPendingTab({ id: tab.id, from: route });
    const href = saved?.href ?? tab.href;
    // The history keeps the first tab and at most one other tab, as in a native app: "Back" from any
    // tab leads to the first one, then out (QA 22.10: six presses to get out after five tab taps).
    const home = zone ? tabsForZone(zone)[0].id : null;
    const homeSteps = zone && tab.id === home ? stepsBackToHome(zone) : null;
    if (homeSteps !== null) window.history.go(homeSteps);
    else openTab(router, href, { replace: tabId !== null && tabId !== home });
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
  const running = useRef<Playback | null>(null);
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { route, zone, tabId };
    // The zone of settings opened directly arrives after hydration: no navigation, nothing to play.
    if (before.route === route) return;
    const asked = intent.current;
    intent.current = null;
    const transition = transitionBetween(before, shown.current, asked);
    const target = transition === "zone" ? frameRef.current : screenRef.current;
    // Another tab shows at once: a fade from transparent read as a blink of the whole screen, the
    // header's title included (QA in Telegram, 21.10).
    if (!transition || transition === "tab" || !target) return;
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
          activeId={shownTabId}
          segment={routeZone ? (rest[0] ?? null) : null}
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
          data-skeleton-instant={skeleton !== null ? "" : undefined}
          className={cn(
            "min-w-0 flex-1 overflow-x-clip outline-none md:pb-0",
            zone ? "pb-[calc(var(--size-tabbar)+var(--safe-bottom))]" : "pb-[var(--safe-bottom)]",
          )}
        >
          <div ref={screenRef} hidden={waitingTab !== null}>
            {children}
          </div>
          {waitingTab !== null ? (
            <ShellContext value={{ ...shell, onProfileTab: waitingTab === profileTabId }}>
              <PendingScreen tab={waitingTab} />
            </ShellContext>
          ) : null}
        </main>
        {/* On every screen of the shell, settings and the profile page included, as in a native app (Rudik 22.10). */}
        {zone ? <TabBar zone={zone} activeId={shownTabId} profileId={profileTabId} onSelect={selectTab} /> : null}
      </div>
      <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />
    </ShellContext>
  );
}

/** The tapped tab's title and skeleton while its screen is on the way (see AppShell). */
function PendingScreen({ tab }: { tab: TabId }) {
  const { t } = useI18n();
  const { column, render } = PENDING_SKELETONS[tab];
  return (
    <Screen header={<ScreenHeader title={tabLabel(t, tab)} subtitle={DATED_TABS.has(tab) ? <TodayDate /> : undefined} />}>
      <div className={column}>{render(t.common.loading)}</div>
    </Screen>
  );
}
