import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { InviteResult, isShownStatus } from "@/components/client-links/invite-result";
import { ScanQrButton } from "@/components/client-links/scan-qr-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { CLIENT_CODE_LENGTH, joinPath, normalizeClientCode } from "@/lib/client-links/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.clientLinks.join.title };
}

/** A plain GET form back to this screen: it works before hydration and in any browser. */
function CodeForm({ t, defaultCode, error }: { t: Dictionary; defaultCode?: string; error?: string }) {
  const copy = t.clientLinks.join;
  return (
    <div className="flex flex-col gap-3">
      <form method="get" action="/join" className="flex flex-col gap-4">
        <TextField
          name="code"
          label={copy.codeLabel}
          hint={copy.codeHint}
          error={error}
          defaultValue={defaultCode}
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          // Room for a space or a dash typed in the middle.
          maxLength={CLIENT_CODE_LENGTH + 4}
          className="[&_input]:text-title-2 [&_input]:tracking-widest"
        />
        <Button type="submit" size="lg" block>
          {copy.check}
        </Button>
      </form>
      <ScanQrButton />
    </div>
  );
}

async function JoinStep({ searchParams }: { searchParams: PageProps<"/[lang]/join">["searchParams"] }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const copy = t.clientLinks.join;
  const submitted = typeof params.code === "string";
  const code = submitted ? normalizeClientCode(params.code as string) : "";

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) {
    // Inside Telegram /login signs in from initData and comes straight back with the code.
    return (
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{copy.signedOutText}</p>
        <Button asChild size="lg" block>
          <Link href={`/login?next=${encodeURIComponent(joinPath(code))}`}>{copy.signIn}</Link>
        </Button>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <CodeForm t={t} error={submitted ? copy.codeEmpty : undefined} />
      </div>
    );
  }

  const { data, error } = await supabase.rpc("resolve_client_invite", { p_code: code });
  if (error) console.error("resolving a trainer code failed", error.code);
  const invite = data?.[0];
  if (error || !isShownStatus(invite)) {
    // A wrong code, an old one and a code of nobody read the same (SHOP-4).
    return (
      <div className="flex flex-col gap-6">
        <p className="text-callout text-ink-2">{copy.text}</p>
        <CodeForm t={t} defaultCode={code} error={error ? t.clientLinks.errors.failed : copy.invalid} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <InviteResult t={t} invite={invite} code={code} />
      <Button asChild variant="ghost" size="lg" block>
        <Link href="/join">{copy.otherCode}</Link>
      </Button>
    </div>
  );
}

/**
 * "Введите код тренера" (screens.md §3.1 /join, PRD wave-1 §2.3-3): for a person without a link. The
 * code or a scanned QR shows the trainer first, then "Стать клиентом" makes the pair.
 */
export default async function JoinPage(props: PageProps<"/[lang]/join">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[var(--safe-top)] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col items-start gap-3">
        <DaMark className="size-12" />
        <h1 className="text-large-title">{t.clientLinks.join.title}</h1>
      </div>
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <JoinStep searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
