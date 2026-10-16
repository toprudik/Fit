import Link from "next/link";
import { notFound } from "next/navigation";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { cardMatchesPerson } from "@/lib/pairs/clients";
import { formatDay } from "@/lib/pairs/format";
import { loadClaim, loadClientLimit } from "@/lib/pairs/load";
import { ClaimAnswers } from "./claim-answers";
import { PairNotice } from "./trainer-pair";

/**
 * "Это тот же клиент?" (screens.md, PRD wave-1 §2.5-3a): who came by the link, the trainer's cards without an
 * account with the name hint, and the two answers. Not the trainer's claim → 404; a decided one says so.
 */
export async function ClaimScreen({ claimId }: { claimId: string }) {
  const [t, locale, claim] = await Promise.all([getDictionary(), getLocale(), loadClaim(claimId)]);
  if (!claim) notFound();
  const copy = t.pairs.claims;
  const name = claim.person.name || t.botMessages.unnamedClient;
  const limit = claim.status === "pending" && claim.limitFull ? await loadClientLimit() : null;
  const person = { first_name: claim.person.firstName, last_name: claim.person.lastName, username: claim.person.username };

  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/trainer/clients" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-3 md:pt-0">
        <div className="flex items-center gap-3 rounded-lg bg-surface-1 p-4">
          <PersonAvatar name={name} src={claim.person.photoUrl} size={40} decorative />
          <p className="text-callout">{interpolate(copy.text, { name })}</p>
        </div>
        {claim.status === "pending" ? (
          <ClaimAnswers
            claimId={claim.id}
            cards={claim.cards.map((card) => ({
              id: card.id,
              name: card.name || t.botMessages.unnamedClient,
              since: interpolate(copy.since, { date: formatDay(locale, card.startedAt, claim.timeZone) }),
              match: cardMatchesPerson(card.name, person),
              carries: { sessions: card.sessions, passes: card.passes, payments: card.payments, notes: card.notes, measurements: card.measurements },
            }))}
            newClientNote={
              claim.limitFull ? (
                <>
                  <PairNotice>{copy.limitWarning}</PairNotice>
                  <TierLock
                    plan="trainer_pro"
                    title={t.pairs.cards.limitTitle}
                    feature="trainer.unlimited_clients"
                    requested={limit?.requested ?? false}
                  />
                </>
              ) : undefined
            }
          />
        ) : (
          <>
            <PairNotice>{claim.status === "merged" ? copy.mergedText : copy.rejectedText}</PairNotice>
            <Button asChild variant="secondary" size="lg" block>
              <Link href={claim.newCoachingId ? `/trainer/clients/${claim.newCoachingId}` : "/trainer/clients"}>{copy.openClient}</Link>
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}
