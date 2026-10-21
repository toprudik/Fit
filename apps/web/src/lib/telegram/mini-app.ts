import { backButton, hapticFeedback, openLink, swipeBehavior, viewport } from "@tma.js/sdk-react";
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

function subscribeTopControls(listener: () => void) {
  return safely(() => viewport.contentSafeAreaInsetTop.sub(listener)) ?? (() => {});
}

function topControlsShown() {
  return (safely(() => viewport.contentSafeAreaInsetTop()) ?? 0) > 0;
}

/**
 * True while Telegram draws its own buttons over the top of the app: fullscreen on a phone, with
 * «Закрыть» (or «Назад») on the left and «⌄ ⋯» on the right. Their row is the top content safe
 * area inset, `--tg-viewport-content-safe-area-inset-top` in CSS. False on the website and at full height.
 */
export function useTelegramTopControls(): boolean {
  const inTelegram = useInTelegram();
  const shown = useSyncExternalStore(subscribeTopControls, topControlsShown, () => false);
  return inTelegram && shown;
}

/**
 * The sign-in from initData (ADR 0004): `pending` while the request is on its way, `signed-in` once
 * the server set the session, `failed` when the request or the server failed (another try may
 * work), `reopen` when there is no initData or the server rejected it as too old (only a new launch
 * of the Mini App brings fresh initData), `blocked` when the browser does not keep the app's cookies,
 * as in Telegram Web with third-party cookies blocked (only the Telegram app helps), `banned` when an
 * admin blocked the account (ADM-7).
 */
export type MiniAppSignInStatus = "pending" | "signed-in" | "failed" | "reopen" | "blocked" | "banned";
export type MiniAppSignInResult = Exclude<MiniAppSignInStatus, "pending">;

let signInStatus: MiniAppSignInStatus | null = null;
let sendInitData: (() => Promise<MiniAppSignInResult>) | null = null;
let pendingSignIn: Promise<MiniAppSignInResult> | null = null;
/** Sign-ins answered on this page load. */
let answered = 0;
/** `answered` when the screen that needs the session now (/login) started showing; null while it is not shown. */
let visitFrom: number | null = null;
const signInListeners = new Set<() => void>();

function notifySignIn() {
  for (const listener of signInListeners) listener();
}

function setSignInStatus(status: MiniAppSignInStatus) {
  signInStatus = status;
  notifySignIn();
}

function subscribeSignIn(listener: () => void) {
  signInListeners.add(listener);
  return () => signInListeners.delete(listener);
}

/**
 * Called by the Telegram provider inside Telegram, on every page load: `send` posts this launch's
 * initData and resolves with how it went; null when there is no initData to post.
 */
export function setMiniAppSignIn(send: (() => Promise<MiniAppSignInResult>) | null) {
  sendInitData = send;
  if (!send) setSignInStatus("reopen");
}

/** Signs in from initData, or joins the sign-in already on its way, and resolves with how it went. */
export function signInToMiniApp(): Promise<MiniAppSignInResult> {
  if (pendingSignIn) return pendingSignIn;
  if (!sendInitData) return Promise.resolve("reopen");
  // A reason belongs to one answer: lifted since, the block must not show an old one.
  blockReason = null;
  setSignInStatus("pending");
  pendingSignIn = sendInitData().then((result) => {
    pendingSignIn = null;
    answered += 1;
    setSignInStatus(result);
    return result;
  });
  return pendingSignIn;
}

/**
 * Where the sign-in from initData stands; null on the website and on the server. Not null means the
 * app runs inside Telegram, and the account is the Telegram account the Mini App was opened with.
 */
export function useMiniAppSignIn(): MiniAppSignInStatus | null {
  return useSyncExternalStore(subscribeSignIn, () => signInStatus, () => null);
}

/** The admin's reason for a `banned` answer (ADM-7); null when the admin left none or nothing is banned. */
let blockReason: string | null = null;

/** Called by the Telegram provider with what the server sent along with `banned`; only text is kept, at most 500 characters. */
export function setMiniAppBlockReason(reason: unknown) {
  blockReason = typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
}

/** The reason of the block, shown on /login with the `banned` status (user agreement 15). */
export function useMiniAppBlockReason(): string | null {
  return useSyncExternalStore(subscribeSignIn, () => blockReason, () => null);
}

/** Answers another request may change; `reopen`, `blocked` and `banned` hold for the whole page load. */
const mayChange = (status: MiniAppSignInStatus | null) => status === "signed-in" || status === "failed";

/** The sign-in as of the current visit: `pending` until an answer arrives during it. */
function signInNow(): MiniAppSignInStatus | null {
  return mayChange(signInStatus) && (visitFrom === null || answered <= visitFrom) ? "pending" : signInStatus;
}

const subscribeNever = () => () => {};

/**
 * `useMiniAppSignIn` for a screen that needs the session to exist now (/login). An answer from before
 * the app got there says nothing about that: the session may have expired since, or a sign-out on
 * the website ended it. So a visit that starts with a navigation inside the app sends initData again
 * (or follows the request already on its way) and reports only answers that arrive during the visit;
 * until then it is `pending`. A visit that starts with the page load takes every answer of that load.
 */
export function useMiniAppSignInNow(): MiniAppSignInStatus | null {
  // The first render of a page load hydrates the server's HTML; a navigation inside the app does not.
  const hydrating = !useSyncExternalStore(subscribeNever, () => true, () => false);
  const fromPageLoad = useRef(hydrating);
  useEffect(() => {
    visitFrom = fromPageLoad.current ? 0 : answered;
    // Shown again later (Next keeps a page it leaves, in React Activity): that is a new visit.
    fromPageLoad.current = false;
    if (mayChange(signInStatus) && answered <= visitFrom) void signInToMiniApp();
    else notifySignIn();
    return () => {
      visitFrom = null;
    };
  }, []);
  return useSyncExternalStore(subscribeSignIn, signInNow, () => null);
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

/** Success feedback after a finished action: joined a trainer, booked a session (screens.md §1.5). */
export function hapticSuccess() {
  if (ready) safely(() => hapticFeedback.notificationOccurred("success"));
}

/** Error feedback after an action that did not go through: a stale check-in code (PRD wave-3 §5 rule 8). */
export function hapticError() {
  if (ready) safely(() => hapticFeedback.notificationOccurred("error"));
}

/**
 * Opens an outside page, such as the trainer's payment link, in the browser instead of the Mini App (PRD 2.8-15).
 * Returns false outside Telegram or when the call fails, and the caller lets the link open by itself.
 */
export function openExternalLink(url: string): boolean {
  if (!ready) return false;
  return safely(() => {
    openLink(url);
    return true;
  }) ?? false;
}

/** Selection feedback: segmented controls, pickers, switches. */
export function hapticSelection() {
  if (ready) safely(() => hapticFeedback.selectionChanged());
}

/*
 * Telegram has one BackButton, but a push screen and a sheet opened on it may both want it.
 * Handlers form a stack: the newest one gets the press. Under the stack lies the fallback the shell
 * sets for every screen that is not a root (useTelegramBackFallback), so a screen that forgot its
 * own "Back" still has one; the button hides when both are empty.
 */
const backStack: { current: () => void }[] = [];
let backFallback: { current: () => void } | null = null;
let detachClick: (() => void) | null = null;

function syncBackButton() {
  if (!ready) return;
  safely(() => {
    if (backStack.length === 0 && !backFallback) {
      backButton.hide();
      detachClick?.();
      detachClick = null;
      return;
    }
    if (!detachClick) detachClick = backButton.onClick(() => (backStack.at(-1) ?? backFallback)?.current());
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

/**
 * Sets the BackButton's fallback: pressed when no screen or sheet holds the button. Pass null on a
 * root screen. One holder at a time (the shell), unlike useTelegramBackButton.
 */
export function useTelegramBackFallback(onBack: (() => void) | null) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  const active = onBack !== null;
  useEffect(() => {
    if (!active) return;
    const entry = { current: () => handler.current?.() };
    backFallback = entry;
    syncBackButton();
    return () => {
      if (backFallback === entry) backFallback = null;
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
  signInStatus = null;
  blockReason = null;
  sendInitData = null;
  pendingSignIn = null;
  answered = 0;
  visitFrom = null;
}
