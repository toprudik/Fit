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
/** Target of a browser back/forward in progress: popstate fires before the router renders the page. */
let poppedTo: string | null = null;

function currentUrl() {
  return `${window.location.pathname}${window.location.search}`;
}

function record(url: string) {
  const popped = poppedTo === url;
  poppedTo = null;
  if (popped) {
    // Back or forward: move to the nearest matching entry, looking back first.
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
 * How the current screen was reached, read while it mounts: "load" for the first page of this tab,
 * "pop" for the browser's back/forward, "push" for an in-app navigation. Push transitions only play
 * on "push".
 */
export function arrival(): "load" | "push" | "pop" {
  if (entries.length === 0) return "load";
  return poppedTo === currentUrl() ? "pop" : "push";
}

/** Back to the previous screen if we came from one in this app, otherwise to `fallbackHref`. */
export function useBack(fallbackHref: string): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (index > 0) router.back();
    else router.push(fallbackHref);
  }, [router, fallbackHref]);
}

function HistoryRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    const onPopState = () => {
      poppedTo = currentUrl();
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
