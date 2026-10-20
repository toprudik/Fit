import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { MiniAppLogin } from "@/components/telegram/mini-app-login";
import { Button } from "@/components/ui/button";
import { clientEnv } from "@/env/client";
import { getDictionary } from "@/i18n/server";
import { safeNext } from "@/lib/auth/oidc-cookie";
import { LEGAL_PATH } from "@/lib/legal/documents";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.login.title };
}

const ERROR_KEYS = ["expired", "denied", "state", "failed", "blocked"] as const;
type ErrorKey = (typeof ERROR_KEYS)[number];
const isErrorKey = (value: unknown): value is ErrorKey => typeof value === "string" && (ERROR_KEYS as readonly string[]).includes(value);

async function LoginAction({ searchParams }: { searchParams: PageProps<"/[lang]/login">["searchParams"] }) {
  const [t, { error, next }] = await Promise.all([getDictionary(), searchParams]);
  const nextPath = typeof next === "string" ? next : null;
  const href = `/auth/telegram/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`;

  return (
    // Inside Telegram the OIDC page does not load: the Mini App signs in from initData instead.
    <MiniAppLogin next={safeNext(nextPath, clientEnv.NEXT_PUBLIC_APP_URL)}>
      {isErrorKey(error) ? (
        <p role="alert" className="text-subhead text-danger">
          {t.login.errors[error]}
        </p>
      ) : null}
      {/* Plain link: the route handler redirects to Telegram's OIDC authorization page. */}
      <Button asChild size="lg" block>
        <a href={href}>{t.login.action}</a>
      </Button>
    </MiniAppLogin>
  );
}

export default async function LoginPage(props: PageProps<"/[lang]/login">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[var(--safe-top)] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col items-start gap-3">
        <DaMark className="size-12" />
        <h1 className="text-large-title">{t.login.title}</h1>
        <p className="text-callout text-ink-2">{t.login.description}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Suspense fallback={<div className="h-13" aria-hidden />}>
          <LoginAction searchParams={props.searchParams} />
        </Suspense>
      </div>
      {/* Only strictly necessary and functional first-party cookies, so a notice with a link is enough (cookie notice §1). */}
      <p className="text-footnote text-ink-2">
        {t.login.cookies}{" "}
        <Link href={`${LEGAL_PATH}/cookies`} className="font-semibold text-accent-ink underline-offset-2 hover:underline">
          {t.login.cookiesLink}
        </Link>
      </p>
    </main>
  );
}
