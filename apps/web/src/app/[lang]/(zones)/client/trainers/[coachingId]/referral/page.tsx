import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReferralShare } from "@/components/referrals/referral-share";
import { SharingSignedOut } from "@/components/sharing/sharing-signed-out";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary, getLocale } from "@/i18n/server";
import { clientPairPath } from "@/lib/intake/paths";
import { clientReferralPath, referralUrl } from "@/lib/referrals/link";
import { loadClientReferral } from "@/lib/referrals/load";
import { clientTermLines } from "@/lib/referrals/present";
import { loadClientSharing, SIGNED_OUT } from "@/lib/sharing/load";
import { clientEnv } from "@/env/client";

// A pair id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.referrals.client.title };
}

type Params = PageProps<"/[lang]/client/trainers/[coachingId]/referral">["params"];

async function Referral({ params }: { params: Params }) {
  const { coachingId } = await params;
  const [t, locale, pair] = await Promise.all([getDictionary(), getLocale(), loadClientSharing(coachingId)]);
  if (pair === SIGNED_OUT) return <SharingSignedOut t={t} next={clientReferralPath(coachingId)} />;
  if (!pair) notFound();
  const copy = t.referrals.client;
  const referral = pair.live ? await loadClientReferral(pair.coachingId) : null;
  if (!referral) return <p className="rounded-lg bg-surface-1 p-4 text-callout text-ink-2">{copy.none}</p>;
  const name = pair.trainerName || t.botMessages.unnamedTrainer;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 px-1">
        {clientTermLines(t, locale, referral, name).map((line) => (
          <p key={line} className="text-callout">
            {line}
          </p>
        ))}
      </div>
      <ReferralShare link={referralUrl(referral.code, clientEnv.NEXT_PUBLIC_APP_URL)} />
      <ListGroup header={copy.friends}>
        {referral.friends.length ? (
          referral.friends.map((friend, index) => (
            <ListRow
              key={index}
              avatar={{ name: friend.firstName || t.referrals.unnamed }}
              title={friend.firstName || t.referrals.unnamed}
              value={copy.statuses[friend.status]}
            />
          ))
        ) : (
          <p className="px-4 py-3 text-subhead text-ink-2">{copy.noFriends}</p>
        )}
      </ListGroup>
    </div>
  );
}

async function Header({ params }: { params: Params }) {
  const [{ coachingId }, t] = await Promise.all([params, getDictionary()]);
  return <ScreenHeader title={t.referrals.client.title} back={{ fallbackHref: clientPairPath(coachingId) }} />;
}

/**
 * «Приведи друга» of one trainer for the client (PRD wave-3 §3.1-3): the terms, the personal link to share and the
 * friends who came by it, with where each one is.
 */
export default async function ClientReferralPage(props: PageProps<"/[lang]/client/trainers/[coachingId]/referral">) {
  const t = await getDictionary();
  return (
    <Screen
      header={
        <Suspense fallback={<ScreenHeader title={t.referrals.client.title} />}>
          <Header params={props.params} />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <Referral params={props.params} />
      </Suspense>
    </Screen>
  );
}
