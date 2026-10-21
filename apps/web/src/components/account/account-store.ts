import { useSyncExternalStore } from "react";

/**
 * Who is signed in, as the shell shows it: a name, the Telegram photo, which parts of the app
 * the account has (a trainer profile, the admin role) and whether the bot can write to it. Pages are
 * prerendered without a session, so the account arrives separately (AccountLoader → AccountSync)
 * and every client component reads it from here.
 */
export type Account =
  | { status: "loading" }
  | { status: "signed-out" }
  | {
      status: "signed-in";
      name: string;
      photoUrl: string | null;
      isTrainer: boolean;
      isAdmin: boolean;
      /** The bot cannot write to the account (AUTH-7): the profile shows the "notifications are off" banner. */
      botBlocked: boolean;
      /** The bot's chat, t.me/<bot>: on the website the banner sends the user there to start it. */
      botUrl: string;
      /** The account's time zone (user_settings), the one its screens count days in. */
      timeZone?: string;
    };

const LOADING: Account = { status: "loading" };

let current: Account = LOADING;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameAccount(a: Account, b: Account): boolean {
  if (a.status !== "signed-in" || b.status !== "signed-in") return a.status === b.status;
  return a.name === b.name && a.photoUrl === b.photoUrl && a.isTrainer === b.isTrainer && a.isAdmin === b.isAdmin && a.botBlocked === b.botBlocked && a.botUrl === b.botUrl && a.timeZone === b.timeZone;
}

/** Replaces the account. A refresh that brings the same data re-renders nothing. */
export function setAccount(account: Account) {
  if (sameAccount(current, account)) return;
  current = account;
  for (const listener of listeners) listener();
}

/** The current account. The server render and hydration always see "loading", whatever the browser knows. */
export function useAccount(): Account {
  return useSyncExternalStore(subscribe, () => current, () => LOADING);
}

/** Test hook: back to "loading" with no subscribers. */
export function resetAccountStoreForTests() {
  current = LOADING;
  listeners.clear();
}
