"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect } from "react";
import { isChunkLoadError, reloadForNewBuild } from "@/lib/navigation/stale-build";
import { activeTab, tabsForZone, zoneFromPath } from "@/lib/navigation/zones";

/*
 * This tab's in-app history: the URLs visited since the page loaded and where we are among them.
 * "Back" may call router.back() only when the previous entry is ours. On a page opened directly (a
 * deep link, a bot button, a reload) router.back() would leave the app or do nothing, so it goes
 * up to a fallback screen instead.
 */
const entries: string[] = [];
/** Per entry: opened by a tap on the tab bar rather than by a link on a screen (openTab). */
const byTab: boolean[] = [];
let index = -1;
/** Target of a browser back/forward whose popstate came before the router rendered the page. */
let poppedTo: string | null = null;
/** The popstate inside which the router already rendered and we recorded the page (see traversal). */
let recordedPop: Event | null = null;
/** Set by "Back" when it goes up to its fallback screen: a push in the history, a pop for the user. */
let goingUp = false;
/** Set by replaceScreen: the next page takes the current entry instead of adding one. */
let replacing = false;
/** Set by openTab: the next page is a tab the user switched to. */
let switchingTab = false;

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * The popstate event being dispatched, if any. React renders a router transition started by popstate
 * at once, inside the event (that keeps scroll restoration working), so the page is committed, and
 * recorded, before our own popstate listener gets to run.
 */
function traversal(): Event | null {
  const event = window.event;
  return event?.type === "popstate" ? event : null;
}

function record(url: string) {
  const event = traversal();
  const popped = poppedTo === url || event !== null;
  if (event) recordedPop = event;
  poppedTo = null;
  goingUp = false;
  const replaced = replacing;
  const tab = switchingTab;
  replacing = false;
  switchingTab = false;
  if (replaced && !popped && index >= 0) {
    entries[index] = url;
    entries.length = byTab.length = index + 1;
    byTab[index] = tab;
    return;
  }
  if (popped) {
    // Back or forward: move to the nearest matching entry, looking back first. popstate doesn't say
    // which way it went, so a Forward to a URL that is also behind us counts as a Back (it plays as a
    // pop); history.state belongs to Next.js, so we don't store our own index there.
    const back = index > 0 ? entries.lastIndexOf(url, index - 1) : -1;
    const forward = entries.indexOf(url, index + 1);
    const found = back !== -1 ? back : forward;
    if (found !== -1) {
      index = found;
      return;
    }
    // Back past the first page we saw: whatever lies behind it is unknown, so start over from here.
    entries.length = byTab.length = 0;
    index = -1;
  }
  if (entries[index] === url) return;
  entries.length = byTab.length = index + 1;
  entries.push(url);
  byTab.push(tab);
  index = entries.length - 1;
}

/**
 * How the current screen was reached, read while it is committed (in a layout effect, before the
 * tracker records it): "load" for the first page of this tab, "pop" for "Back" and the browser's back
 * button, "push" for an in-app navigation and the browser's forward button, which opens again what
 * "Back" closed.
 */
export function arrival(): "load" | "push" | "pop" {
  if (entries.length === 0) return "load";
  if (goingUp) return "pop";
  const url = currentUrl();
  if (poppedTo !== url && !traversal()) return "push";
  const back = index > 0 ? entries.lastIndexOf(url, index - 1) : -1;
  const forward = entries.indexOf(url, index + 1);
  return back === -1 && forward !== -1 ? "push" : "pop";
}

/** The tab a URL belongs to, as "zone/tab", and whether it is that tab's root; null outside the tabs. */
function tabOf(url: string): { key: string; zone: string; root: boolean; home: boolean } | null {
  const path = url.split("?")[0];
  const zone = zoneFromPath(path);
  if (!zone) return null;
  const segments = path.split("/").slice(2).filter(Boolean);
  const tab = activeTab(zone, segments);
  if (!tab) return null;
  return { key: `${zone}/${tab.id}`, zone, root: segments.length <= 1, home: tabsForZone(zone)[0].id === tab.id };
}

/**
 * Where the zone's first tab («Главная», «Сегодня») sits behind the current screen, as a step for
 * history.go (-1 is the previous entry), or null when it is not there: the history holds the first
 * tab's stack, then at most the stack of one other tab (AppShell switches tabs that way).
 */
export function stepsBackToHome(zone: string): number | null {
  for (let at = index - 1; at >= 0; at--) {
    const tab = tabOf(entries[at]);
    if (tab?.home && tab.zone === zone) return at - index;
  }
  return null;
}

/** Opens `href` in place of the current screen, so the history does not grow (another tab). */
export function replaceScreen(router: ReturnType<typeof useRouter>, href: string) {
  replacing = true;
  switchingTab = false;
  router.replace(href, { scroll: false });
}

/**
 * Opens a tab the user tapped on the tab bar, on top of the current screen or in its place. useBack
 * goes up from a tab opened this way on its last screen; a screen of another tab opened by a link
 * goes back to the screen with the link instead.
 */
export function openTab(router: ReturnType<typeof useRouter>, href: string, { replace }: { replace: boolean }) {
  replacing = replace;
  switchingTab = true;
  if (replace) router.replace(href, { scroll: false });
  else router.push(href, { scroll: false });
}

/**
 * Back to the previous screen if we came from one in this app, otherwise up to `fallbackHref`. A
 * previous screen of another tab doesn't count when the tab bar reopened this tab on its last
 * screen: that goes up to the tab's root, as in a native app, and the root takes the screen's place
 * in the history. A screen of another tab opened by a link («Цель и норма питания» on «Прогресс»)
 * goes back to the link (QA 22.10: going up there left a dead "Back").
 */
export function useBack(fallbackHref: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (index > 0) {
      const here = tabOf(entries[index]);
      const before = tabOf(entries[index - 1]);
      const otherTab = byTab[index] && here !== null && before !== null && here.key !== before.key && !here.root;
      if (!otherTab) {
        router.back();
        return;
      }
      goingUp = true;
      replaceScreen(router, fallbackHref);
      return;
    }
    goingUp = true;
    // From a tab's root up to the first tab: nothing to keep behind it, so it replaces the root.
    if (index === 0 && tabOf(entries[0])?.root) replaceScreen(router, fallbackHref);
    else router.push(fallbackHref);
  }, [router, fallbackHref]);
}

function HistoryRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // Already recorded if the router rendered the page inside this very event.
      if (event !== recordedPop) poppedTo = currentUrl();
    };
    // A chunk of the next screen that failed to load outside React (a prefetch, a lazy import).
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) reloadForNewBuild();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Rendered output never depends on the pathname (it differs between the server and the browser
  // because of the locale rewrite); it only tells this effect that a navigation happened.
  useEffect(() => {
    record(currentUrl());
  }, [pathname]);

  return null;
}

/**
 * Counts in-app navigations for useBack. Mounted once in the root layout. The Suspense boundary keeps
 * routes with params unknown at build time (the not-found catch-all) prerenderable: usePathname()
 * suspends there during the build.
 */
export function NavigationTracker() {
  return (
    <Suspense fallback={null}>
      <HistoryRecorder />
    </Suspense>
  );
}
