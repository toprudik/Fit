"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect } from "react";

/*
 * This tab's in-app history: the URLs visited since the page loaded and where we are among them.
 * "Back" may call router.back() only when the previous entry is ours. On a page opened directly (a
 * deep link, a bot button, a reload) router.back() would leave the app or do nothing, so it goes
 * up to a fallback screen instead.
 */
const entries: string[] = [];
let index = -1;
/** Target of a browser back/forward whose popstate came before the router rendered the page. */
let poppedTo: string | null = null;
/** The popstate inside which the router already rendered and we recorded the page (see traversal). */
let recordedPop: Event | null = null;
/** Set by "Back" when it goes up to its fallback screen: a push in the history, a pop for the user. */
let goingUp = false;

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
    entries.length = 0;
    index = -1;
  }
  if (entries[index] === url) return;
  entries.length = index + 1;
  entries.push(url);
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

/** Back to the previous screen if we came from one in this app, otherwise up to `fallbackHref`. */
export function useBack(fallbackHref: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (index > 0) {
      router.back();
      return;
    }
    goingUp = true;
    router.push(fallbackHref);
  }, [router, fallbackHref]);
}

function HistoryRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      // Already recorded if the router rendered the page inside this very event.
      if (event !== recordedPop) poppedTo = currentUrl();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
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
