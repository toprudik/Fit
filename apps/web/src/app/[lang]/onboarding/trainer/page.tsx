import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DaMark } from "@/components/brand/da-mark";
import { RedeemButton } from "@/components/trainer-invites/redeem-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import type { Dictionary } from "@/i18n/dictionaries";
import { getDictionary } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInviteCode, INVITE_CODE_LENGTH, normalizeInviteCode, redeemPath } from "@/lib/trainer-invites/code";
import { WIZARD_START_PATH } from "@/lib/trainer-wizard/steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerInvite.title };
}

/** What trainer_invite_status answers, with already_trainer renamed for the catalog. */
type InviteStatus = keyof Dictionary["trainerInvite"]["status"];

function toStatus(value: string | null): InviteStatus | null {
  if (value === "already_trainer") return "alreadyTrainer";
  return value === "valid" ||
    value === "referral" ||
    value === "invalid" ||
    value === "redeemed" ||
    value === "expired" ||
    value === "revoked"
    ? value
    : null;
}

/** A plain GET form back to this screen: it works before hydration and in any browser. */
function CodeForm({ t, defaultCode, error }: { t: Dictionary; defaultCode?: string; error?: string }) {
  return (
    <form method="get" action="/onboarding/trainer" className="flex flex-col gap-4">
      <TextField
        name="code"
        label={t.trainerInvite.codeLabel}
        hint={t.trainerInvite.codeHint}
        error={error}
        defaultValue={defaultCode ? formatInviteCode(defaultCode) : undefined}
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        // Room for the dashes between the groups of four.
        maxLength={INVITE_CODE_LENGTH + 8}
      />
      <Button type="submit" size="lg" block>
        {t.trainerInvite.check}
      </Button>
    </form>
  );
}

function StatusText({ t, status }: { t: Dictionary; status: InviteStatus }) {
  const copy = t.trainerInvite.status[status];
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-title-2">{copy.title}</h2>
      <p className="text-callout text-ink-2">{copy.text}</p>
    </div>
  );
}

async function InviteStep({ searchParams }: { searchParams: PageProps<"/[lang]/onboarding/trainer">["searchParams"] }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const submitted = typeof params.code === "string";
  const code = submitted ? normalizeInviteCode(params.code as string) : "";

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) {
    // Inside Telegram /login signs in from initData and comes straight back with the code.
    return (
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{t.trainerInvite.signedOutText}</p>
        <Button asChild size="lg" block>
          <Link href={`/login?next=${encodeURIComponent(redeemPath(code))}`}>{t.trainerInvite.signIn}</Link>
        </Button>
      </div>
    );
  }

  // With no code the answer is already_trainer for trainers and invalid for everyone else.
  const { data, error } = await supabase.rpc("trainer_invite_status", { p_code: code });
  const status = error ? null : toStatus(data);
  if (error) console.error("checking a trainer invite failed", error.code);

  if (status === "alreadyTrainer") {
    return (
      <div className="flex flex-col gap-6">
        <StatusText t={t} status={status} />
        <div className="flex flex-col gap-3">
          <Button asChild size="lg" block>
            <Link href="/trainer">{t.trainerInvite.openTrainer}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" block>
            <Link href={WIZARD_START_PATH}>{t.trainerWizard.fillProfile}</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!code || status === null) {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-callout text-ink-2">{status === null ? t.trainerInvite.failed : t.trainerInvite.enterText}</p>
        <CodeForm t={t} defaultCode={code} error={submitted && !code ? t.trainerInvite.codeEmpty : undefined} />
      </div>
    );
  }
  // "referral" is another trainer's referral code (PRD wave-3 §3.2-9): it always works and opens the zone the same way.
  if (status === "valid" || status === "referral") {
    return (
      <div className="flex flex-col gap-6">
        <StatusText t={t} status={status} />
        <p className="text-headline tabular-nums">{formatInviteCode(code)}</p>
        <div className="flex flex-col gap-3">
          <RedeemButton code={code} />
          <Button asChild variant="ghost" size="lg" block>
            <Link href="/onboarding/trainer">{t.trainerInvite.otherCode}</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <StatusText t={t} status={status} />
      <CodeForm t={t} />
    </div>
  );
}

/**
 * Redeeming a trainer invite (screens.md §3.1, PRD wave-1 §2.2): the code from the link or typed in,
 * its status, then "Стать тренером", which opens the profile wizard (/onboarding/trainer/[step]).
 */
export default async function TrainerInvitePage(props: PageProps<"/[lang]/onboarding/trainer">) {
  const t = await getDictionary();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 pt-[var(--safe-top)] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col items-start gap-3">
        <DaMark className="size-12" />
        <h1 className="text-large-title">{t.trainerInvite.title}</h1>
      </div>
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <InviteStep searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
