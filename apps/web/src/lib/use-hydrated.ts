import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * False while server HTML is being hydrated, true once the client renders on its own. For values
 * only the browser knows (a cookie, a saved preference): render the server default first, then the
 * real value, without a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
