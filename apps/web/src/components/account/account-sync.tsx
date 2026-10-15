"use client";

import { useEffect } from "react";
import { setAccount } from "./account-store";

type AccountSyncProps = {
  /** The signed-in person as the server read it, or null when nobody is signed in. */
  account: { name: string; photoUrl: string | null } | null;
};

/**
 * Hands the account that AccountLoader read on the server to the client store. Renders nothing.
 * It stays mounted in the root layout, so a router.refresh() after sign-in updates the store too.
 */
export function AccountSync({ account }: AccountSyncProps) {
  const signedIn = account !== null;
  const name = account?.name ?? "";
  const photoUrl = account?.photoUrl ?? null;

  useEffect(() => {
    setAccount(signedIn ? { status: "signed-in", name, photoUrl } : { status: "signed-out" });
  }, [signedIn, name, photoUrl]);

  return null;
}
