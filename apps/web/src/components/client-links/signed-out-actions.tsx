"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { useInTelegram } from "@/lib/telegram/mini-app";

/**
 * Sign-in choices on a client link landing opened without a session (screens.md §1.7 "QR-коды"):
 * "Открыть в Telegram" leads to the Mini App with startapp=ci_<token>; "Войти через Telegram" signs
 * in on the website and comes back. Inside the Mini App only the second makes sense.
 */
export function SignedOutActions({ telegramHref, loginHref }: { telegramHref: string; loginHref: string }) {
  const { t } = useI18n();
  const copy = t.clientLinks.landing;
  const inTelegram = useInTelegram();
  return (
    <div className="flex flex-col gap-3">
      {inTelegram ? null : (
        <Button asChild size="lg" block>
          <a href={telegramHref}>{copy.openInTelegram}</a>
        </Button>
      )}
      <Button asChild size="lg" block variant={inTelegram ? "primary" : "secondary"}>
        <Link href={loginHref}>{copy.signIn}</Link>
      </Button>
    </div>
  );
}
