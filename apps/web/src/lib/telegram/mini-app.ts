import { backButton, hapticFeedback } from "@tma.js/sdk-react";
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

function safely(fn: () => void) {
  try {
    fn();
  } catch {
    // Not supported by this Telegram client: skip.
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

/** Result feedback: success, warning or error after an action. */
export function hapticNotify(type: "success" | "warning" | "error") {
  if (ready) safely(() => hapticFeedback.notificationOccurred(type));
  else if (typeof navigator !== "undefined") navigator.vibrate?.(type === "success" ? 12 : [8, 40, 8]);
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

if (typeof window !== "undefined") readyListeners.add(syncBackButton);

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
