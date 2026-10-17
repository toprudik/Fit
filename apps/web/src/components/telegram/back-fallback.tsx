"use client";

import { usePathname } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";
import { useBack } from "@/components/shell/navigation-tracker";
import { backFallbackHref } from "@/lib/telegram/back-routes";
import { useTelegramBackFallback } from "@/lib/telegram/mini-app";

const subscribeNever = () => () => {};

function BackFallback() {
  // The pathname only tells this component that a navigation happened: the server's one carries the
  // locale of the rewrite (ADR 0015), so the screen is read from the browser's URL.
  usePathname();
  const href = useSyncExternalStore(subscribeNever, () => backFallbackHref(window.location.pathname), () => null);
  const goBack = useBack(href ?? "/");
  useTelegramBackFallback(href === null ? null : goBack);
  return null;
}

/**
 * Telegram's BackButton on every screen that is not a root (backFallbackHref), even one whose
 * header forgot it, or one that is still loading or failed: without it the Mini App has no way back
 * and has to be closed. A screen's own "Back" (ScreenHeader, a sheet) takes the press first. The
 * Suspense boundary keeps routes with params unknown at build time prerenderable, as in
 * NavigationTracker.
 */
export function TelegramBackFallback() {
  return (
    <Suspense fallback={null}>
      <BackFallback />
    </Suspense>
  );
}
