import type { Metadata } from "next";
import { Gift, Lock } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { OfferForm, StopOfferButton } from "@/components/referrals/offer-form";
import { ReferralList } from "@/components/referrals/referral-list";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { currencySymbol } from "@/lib/money/format";
import { loadTrainerReferrals } from "@/lib/referrals/load";
import { offerLines } from "@/lib/referrals/present";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.referrals.title };
}

async function Referrals() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerReferrals()]);
  const copy = t.referrals;
  if (data === "signed-out") {
    return (
      <EmptyState
        icon={Gift}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/referrals")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (!data) return <EmptyState icon={Gift} title={copy.title} description={copy.notTrainer} />;
  if (!data.allowed) {
    return (
      <EmptyState
        icon={Lock}
        title={copy.lockedTitle}
        description={copy.lockedText}
        action={
          <Button asChild>
            <Link href="/settings/plan">{copy.lockedAction}</Link>
          </Button>
        }
      />
    );
  }
  const offer = data.offer;
  return (
    <div className="flex flex-col gap-8">
      <p className="px-1 text-callout text-ink-2">{copy.lead}</p>
      {offer ? (
        <section aria-labelledby="referral-offer" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <h2 id="referral-offer" className="text-headline">
              {copy.offerHeader}
            </h2>
            <Badge tone={offer.live ? "success" : "neutral"}>{offer.live ? copy.live : copy.expired}</Badge>
          </div>
          <ul className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4 text-body">
            {offerLines(t, locale, offer).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <StopOfferButton />
        </section>
      ) : (
        <EmptyState icon={Gift} title={copy.emptyTitle} description={copy.emptyText} />
      )}
      <OfferForm currency={currencySymbol(locale, data.currency)} packages={data.packages} editing={offer !== null} />
      <ReferralList referrals={data.referrals} />
    </div>
  );
}

/**
 * «Приведи друга» (screens.md /trainer/referrals, PRD wave-3 §3.1): the trainer's offer, a form that starts a new
 * one in its place, and every invitation with its bonuses. A trainer without Pro sees where to get it.
 */
export default async function TrainerReferralsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.referrals.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          }
        >
          <Referrals />
        </Suspense>
      </div>
    </Screen>
  );
}
