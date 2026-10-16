import { useSyncExternalStore } from "react";

/**
 * Who is signed in, as the shell shows it: a name, the Telegram photo and which parts of the app
 * the account has (a trainer profile, the admin role). Pages are
 * prerendered without a session, so the account arrives separately (AccountLoader → AccountSync)
 * and every client component reads it from here.
 */
export type Account =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; name: string; photoUrl: string | null; isTrainer: boolean; isAdmin: boolean };

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
  return a.name === b.name && a.photoUrl === b.photoUrl && a.isTrainer === b.isTrainer && a.isAdmin === b.isAdmin;
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
