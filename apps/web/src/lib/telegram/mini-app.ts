import { backButton, hapticFeedback, swipeBehavior } from "@tma.js/sdk-react";
import { useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Client-side Mini App helpers. Everything is a no-op outside Telegram, so components call them
 * unconditionally. The Telegram provider flips `ready` once the SDK is mounted.
 */
let ready = false;
const readyListeners = new Set<() => void>();

export function markMiniAppReady() {
  ready = true;
  for (const listener of readyListeners) listener();
}

function subscribeReady(listener: () => void) {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/** True inside the Telegram Mini App (after the SDK mounted); false on the website and on the server. */
export function useInTelegram(): boolean {
  return useSyncExternalStore(subscribeReady, () => ready, () => false);
}

function report(error: unknown) {
  // Production stays quiet: the app keeps working without the feature, as it does on the website.
  if (process.env.NODE_ENV === "development") console.warn("[telegram]", error);
}

/**
 * Runs a Telegram SDK call that may throw (a client too old for the method, a component that
 * failed to mount, launch params the SDK can't read) and returns its result, or undefined if it
 * threw. Failures are logged in development.
 */
export function safely<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (error) {
    report(error);
    return undefined;
  }
}

/** `safely` for SDK calls that return a promise: resolves to undefined if the call fails. */
export async function safelyAsync<T>(fn: () => PromiseLike<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    report(error);
    return undefined;
  }
}

/** Light tap feedback: tab change, card tap (screens.md §1.5). */
export function hapticImpact() {
  if (ready) safely(() => hapticFeedback.impactOccurred("light"));
  else if (typeof navigator !== "undefined") navigator.vibrate?.(8);
}

/** Selection feedback: segmented controls, pickers, switches. */
export function hapticSelection() {
  if (ready) safely(() => hapticFeedback.selectionChanged());
}

/*
 * Telegram has one BackButton, but a push screen and a sheet opened on it may both want it.
 * Handlers form a stack: the newest one gets the press, and the button hides when the stack is empty.
 */
const backStack: { current: () => void }[] = [];
let detachClick: (() => void) | null = null;

function syncBackButton() {
  if (!ready) return;
  safely(() => {
    if (backStack.length === 0) {
      backButton.hide();
      detachClick?.();
      detachClick = null;
      return;
    }
    if (!detachClick) detachClick = backButton.onClick(() => backStack.at(-1)?.current());
    backButton.show();
  });
}

/**
 * Shows Telegram's BackButton while `onBack` is set and the component is mounted; pressing it calls
 * the latest `onBack`. Pass null to release the button (e.g. on a tab root or a closed sheet).
 */
export function useTelegramBackButton(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  const active = onBack !== null;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => handler.current?.() };
    backStack.push(entry);
    syncBackButton();
    return () => {
      backStack.splice(backStack.indexOf(entry), 1);
      syncBackButton();
    };
  }, [active]);
}

/*
 * Telegram's swipe down to minimize the Mini App would take the drag that closes a sheet
 * (screens.md §1.5 disableVerticalSwipes). Every open sheet holds a lock; swipes come back when
 * the last one is released. The SDK posts only actual changes.
 */
let swipeLocks = 0;

function syncVerticalSwipes() {
  if (!ready) return;
  safely(() => (swipeLocks > 0 ? swipeBehavior.disableVertical() : swipeBehavior.enableVertical()));
}

/** Keeps Telegram's vertical swipes off while `active` is true and the component is mounted. */
export function useTelegramVerticalSwipeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    swipeLocks += 1;
    syncVerticalSwipes();
    return () => {
      swipeLocks -= 1;
      syncVerticalSwipes();
    };
  }, [active]);
}

if (typeof window !== "undefined") {
  readyListeners.add(syncBackButton);
  readyListeners.add(syncVerticalSwipes);
}

/** Test hook: back to the website state. Mounted hooks keep their stack entries and locks. */
export function resetMiniAppForTests() {
  ready = false;
  detachClick?.();
  detachClick = null;
}
