import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HealthDataForm, PersonalDataForm, TermsForm, UnderageForm } from "@/components/onboarding/consent-forms";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { HealthNotice } from "@/components/health/health-notice";
import { LegalDocument } from "@/components/legal/legal-document";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { isDeletionPending } from "@/lib/account/deletion";
import { CONSENT_PATH, PREFERENCES_PATH } from "@/lib/consent/beta-terms";
import { type ConsentDocument, loadConsentDocument } from "@/lib/consent/documents";
import { onboardingNext, withNext } from "@/lib/consent/next";
import { CONSENT_KINDS, hasHealthConsent, pendingStep } from "@/lib/consent/required";
import { hasSeenHealthNotice } from "@/lib/health-notice/seen";
import { LEGAL_PATH } from "@/lib/legal/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.consent.terms.title };
}

type SearchParams = PageProps<"/[lang]/onboarding/consent">["searchParams"];

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** A consent's full text in a box of its own, so the buttons stay in reach. */
function DocumentBox({ document, tableLabel }: { document: ConsentDocument; tableLabel: string }) {
  return (
    <section
      tabIndex={0}
      aria-label={document.title}
      className="max-h-80 overflow-y-auto rounded-lg bg-surface-1 p-4 text-subhead focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      <LegalDocument blocks={document.blocks} tableLabel={tableLabel} />
    </section>
  );
}

async function ConsentStep({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const next = onboardingNext(params.next);
  const isFirst = single(params.first) === "1";
  const copy = t.consent;

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!session || !userId) {
    // Inside Telegram /login signs in from initData and comes straight back here.
    return (
      <>
        <h1 className="text-large-title">{copy.terms.title}</h1>
        <p className="text-callout text-ink-2">{copy.terms.signedOutText}</p>
        <Button asChild size="lg" block>
          <Link href={withNext("/login", withNext(CONSENT_PATH, next))}>{copy.terms.signIn}</Link>
        </Button>
      </>
    );
  }

  // Under 18: the account is on its way out, and a wrong tap can still be undone.
  if (single(params.step) === "underage" && isDeletionPending(session.claims)) {
    return (
      <>
        <div className="flex flex-col gap-3">
          <h1 className="text-large-title">{copy.underage.title}</h1>
          <p className="text-callout text-ink-2">{copy.underage.text}</p>
        </div>
        <UnderageForm next={next} />
      </>
    );
  }

  const { data: rows, error } = await supabase
    .from("consents")
    .select("kind, version")
    .eq("user_id", userId)
    .in("kind", CONSENT_KINDS)
    .is("revoked_at", null);
  if (error) console.error("reading consents failed", error.code);
  const consents = rows ?? [];
  const step = pendingStep(consents);

  if (step === null) {
    // The health data question comes once, right after the required consents; later the health sections ask.
    if (single(params.step) === "health" && !hasHealthConsent(consents)) {
      const [document, noticeSeen] = await Promise.all([loadConsentDocument(locale, "pd_health"), hasSeenHealthNotice()]);
      // The health notice comes first (право 7): "Понятно" remembers it on this device and opens the consent.
      if (!noticeSeen) return <HealthNotice />;
      return (
        <>
          <div className="flex flex-col gap-3">
            <h1 className="text-large-title">{copy.health.title}</h1>
            <p className="text-callout text-ink-2">{copy.health.intro}</p>
          </div>
          {document ? <DocumentBox document={document} tableLabel={t.legal.table} /> : null}
          <HealthDataForm next={next} first={isFirst} />
        </>
      );
    }
    // Given already, in another tab or before the link brought the user here: go on.
    redirect(isFirst ? withNext(PREFERENCES_PATH, next) : next);
  }

  if (step === "personal") {
    const [document, { data: profile }] = await Promise.all([
      loadConsentDocument(locale, "pd_general"),
      supabase.from("profiles").select("first_name, last_name, username").eq("id", userId).maybeSingle(),
    ]);
    // Who gives the consent (152-FZ art. 9 part 4): the Telegram profile the account is tied to.
    const telegramId = (session.claims.app_metadata as Record<string, unknown> | undefined)?.telegram_id;
    const who = [
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
      profile?.username ? `@${profile.username}` : null,
      typeof telegramId === "number" || typeof telegramId === "string" ? `Telegram ID ${telegramId}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <>
        <div className="flex flex-col gap-3">
          <h1 className="text-large-title">{copy.personal.title}</h1>
          <p className="text-callout text-ink-2">{copy.personal.intro}</p>
        </div>
        {document ? <DocumentBox document={document} tableLabel={t.legal.table} /> : null}
        {who ? (
          <p className="text-subhead text-ink-2">
            {copy.personal.who} {who}
          </p>
        ) : null}
        <PersonalDataForm next={next} first={isFirst} />
      </>
    );
  }

  // Someone who accepted earlier texts sees why the screen is back (AUTH-5).
  const updated = consents.some((row) => row.kind === "beta_terms");
  const documents = await Promise.all([loadConsentDocument(locale, "terms"), loadConsentDocument(locale, "privacy_policy")]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-large-title">{updated ? copy.terms.updatedTitle : copy.terms.title}</h1>
        <p className="text-callout text-ink-2">{updated ? copy.terms.updatedIntro : copy.terms.intro}</p>
      </div>
      <ul className="flex list-disc flex-col gap-2 ps-5 text-callout">
        {copy.terms.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {/* Native disclosure: it opens before hydration and needs no script. */}
      <details className="group rounded-lg bg-surface-1 p-4">
        <summary className="cursor-pointer text-headline text-accent-ink">{copy.terms.more}</summary>
        <div className="mt-3 flex flex-col gap-2 text-subhead text-ink-2">
          {copy.terms.details.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </details>
      <div className="flex flex-col gap-1">
        <p className="text-subhead text-ink-2">{copy.terms.documents}</p>
        <ul className="flex flex-col">
          {documents.map((document) =>
            document ? (
              <li key={document.slug}>
                <Link
                  href={`${LEGAL_PATH}/${document.slug}`}
                  className="inline-flex min-h-11 items-center text-callout text-accent-ink underline underline-offset-2"
                >
                  {document.title}
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      </div>
      <TermsForm next={next} />
    </>
  );
}

/**
 * The consents (screens.md §3.1, PRD wave-1 §2.1 rules 3–5, AUTH-4, AUTH-5; legal А1, А2). The proxy sends every
 * signed-in user here, with the screen they asked for in `next`, until they give the required ones in force: the
 * terms screen (beta terms, user agreement, privacy policy, 18+), then personal data, then health data, which may wait.
 */
export default function ConsentPage(props: PageProps<"/[lang]/onboarding/consent">) {
  return (
    <OnboardingScreen>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-13 w-full" />
          </div>
        }
      >
        <ConsentStep searchParams={props.searchParams} />
      </Suspense>
    </OnboardingScreen>
  );
}
