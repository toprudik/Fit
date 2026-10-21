"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BlockedNotice } from "@/components/account/blocked-notice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { signInToMiniApp, useMiniAppBlockReason, useMiniAppSignInNow } from "@/lib/telegram/mini-app";

type MiniAppLoginProps = {
  /** Where to go once signed in: a path on this site. */
  next: string;
  /** The website's way in, Telegram's login for websites (OIDC). */
  children: React.ReactNode;
};

/**
 * The way in on /login. On the website it is `children`. Inside Telegram the account is the one the
 * Mini App was opened with, and Telegram's login page for websites does not load in the Mini App:
 * the page sends initData again (an earlier answer says nothing about the session now) and goes on
 * to `next` once that sign-in succeeds. A failed attempt gets a button to try again; initData that is
 * missing or too old can't be fixed from here, so the page asks to reopen the app, a browser that
 * drops the app's cookies gets sent to the Telegram app, and a blocked account is told so, with the admin's reason.
 */
export function MiniAppLogin({ next, children }: MiniAppLoginProps) {
  const { t } = useI18n();
  const router = useRouter();
  const status = useMiniAppSignInNow();
  const blockReason = useMiniAppBlockReason();

  useEffect(() => {
    if (status !== "signed-in") return;
    router.replace(next);
    // The root layout stays mounted across the navigation, and it reads who is signed in: refresh it.
    router.refresh();
  }, [status, next, router]);

  if (status === null) {
    // Before hydration the Telegram provider has not started yet. Inside Telegram the pre-paint
    // script marks <html data-telegram>: the website's link must not show there even for a moment.
    return (
      <>
        <div className="contents telegram:hidden">{children}</div>
        <div className="hidden telegram:contents">
          <Button size="lg" block loading>
            {t.login.action}
          </Button>
        </div>
      </>
    );
  }
  if (status === "banned") return <BlockedNotice reason={blockReason} />;
  if (status === "reopen" || status === "blocked") {
    const message = { reopen: t.telegram.signInExpired, blocked: t.telegram.cookiesBlocked }[status];
    return (
      <p role="alert" className="text-subhead text-danger">
        {message}
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
