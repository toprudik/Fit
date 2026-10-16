import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AcceptTermsForm } from "@/components/onboarding/accept-terms-form";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { BETA_TERMS_VERSION, CONSENT_PATH } from "@/lib/consent/beta-terms";
import { onboardingNext, withNext } from "@/lib/consent/next";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.consent.terms.title };
}

async function TermsStep({ searchParams }: { searchParams: PageProps<"/[lang]/onboarding/consent">["searchParams"] }) {
  const [t, params] = await Promise.all([getDictionary(), searchParams]);
  const next = onboardingNext(params.next);
  const copy = t.consent.terms;

  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) {
    // Inside Telegram /login signs in from initData and comes straight back here.
    return (
      <>
        <h1 className="text-large-title">{copy.title}</h1>
        <p className="text-callout text-ink-2">{copy.signedOutText}</p>
        <Button asChild size="lg" block>
          <Link href={withNext("/login", withNext(CONSENT_PATH, next))}>{copy.signIn}</Link>
        </Button>
      </>
    );
  }

  const { data: accepted, error } = await supabase
    .from("consents")
    .select("version")
    .eq("user_id", userId)
    .eq("kind", "beta_terms")
    .is("revoked_at", null);
  if (error) console.error("reading beta terms consents failed", error.code);
  // Accepted already, in another tab or before the link brought the user here: go on.
  if (accepted?.some((row) => row.version === BETA_TERMS_VERSION)) redirect(next);
  // Someone who accepted an earlier text sees why the screen is back (AUTH-5).
  const updated = (accepted?.length ?? 0) > 0;

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="text-large-title">{updated ? copy.updatedTitle : copy.title}</h1>
        <p className="text-callout text-ink-2">{updated ? copy.updatedIntro : copy.intro}</p>
      </div>
      <ul className="flex list-disc flex-col gap-2 ps-5 text-callout">
        {copy.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {/* Native disclosure: it opens before hydration and needs no script. */}
      <details className="group rounded-lg bg-surface-1 p-4">
        <summary className="cursor-pointer text-headline text-accent-ink">{copy.more}</summary>
        <div className="mt-3 flex flex-col gap-2 text-subhead text-ink-2">
          {copy.details.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </details>
      <AcceptTermsForm next={next} />
    </>
  );
}

/**
 * Beta terms (screens.md §3.1, PRD wave-1 §2.1 rules 3–5, AUTH-4, AUTH-5). The proxy sends every
 * signed-in user here, with the screen they asked for in `next`, until they accept the version in force.
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
        <TermsStep searchParams={props.searchParams} />
      </Suspense>
    </OnboardingScreen>
  );
}
