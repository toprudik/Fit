"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { signInToMiniApp, useMiniAppSignIn } from "@/lib/telegram/mini-app";

type MiniAppLoginProps = {
  /** Where to go once signed in: a path on this site. */
  next: string;
  /** The website's way in, Telegram's login for websites (OIDC). */
  children: React.ReactNode;
};

/**
 * The way in on /login. On the website it is `children`. Inside Telegram the account is the one the
 * Mini App was opened with, and Telegram's login page for websites does not load in the Mini App:
 * the page follows the sign-in from initData that the Telegram provider runs on every page load and
 * goes on to `next` once it succeeds. A failed attempt gets a button to try again; initData that is
 * missing or too old can't be fixed from here, so the page asks to reopen the app.
 */
export function MiniAppLogin({ next, children }: MiniAppLoginProps) {
  const { t } = useI18n();
  const router = useRouter();
  const status = useMiniAppSignIn();

  useEffect(() => {
    if (status !== "signed-in") return;
    router.replace(next);
    // The root layout stays mounted across the navigation, and it reads who is signed in: refresh it.
    router.refresh();
  }, [status, next, router]);

  if (status === null) return children;
  if (status === "reopen") {
    return (
      <p role="alert" className="text-subhead text-danger">
        {t.telegram.signInExpired}
      </p>
    );
  }
  return (
    <>
      {status === "failed" ? (
        <p role="alert" className="text-subhead text-danger">
          {t.login.errors.failed}
        </p>
      ) : null}
      {/* Busy until the next screen opens, so a second press can't start another sign-in. */}
      <Button size="lg" block loading={status !== "failed"} onClick={() => void signInToMiniApp()}>
        {t.login.action}
      </Button>
    </>
  );
}
