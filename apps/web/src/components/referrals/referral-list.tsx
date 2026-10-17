"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate, plural } from "@/i18n/format";
import { declineReferral } from "@/lib/referrals/actions";
import type { TrainerReferral } from "@/lib/referrals/load";

/**
 * "Приглашения" on /trainer/referrals: every friend who came by a client's link, newest first, with its state
 * and the bonuses given; a pending one can be declined before it is paid (PRD wave-3 §3.1-8).
 */
export function ReferralList({ referrals }: { referrals: TrainerReferral[] }) {
  const { t, locale } = useI18n();
  const copy = t.referrals;
  const [declining, setDeclining] = useState<TrainerReferral | null>(null);
  const [pending, startDecline] = useTransition();

  function decline() {
    if (!declining) return;
    startDecline(async () => {
      const { failed } = await declineReferral(declining.id);
      if (failed) {
        toast.error(copy.declineFailed);
        return;
      }
      setDeclining(null);
      toast.success(copy.declined);
    });
  }

  if (!referrals.length) {
    return (
      <ListGroup header={copy.listHeader}>
        <p className="px-4 py-3 text-subhead text-ink-2">{copy.listEmpty}</p>
      </ListGroup>
    );
  }

  return (
    <>
      <ListGroup header={copy.listHeader}>
        {referrals.map((referral) => {
          const friend = referral.refereeName || copy.unnamed;
          const by = referral.referrerName || copy.unnamed;
          const state =
            referral.status === "void" && referral.voidReason ? copy.voidReasons[referral.voidReason] : copy.statuses[referral.status];
          const granted = [
            referral.referrerSessions > 0 ? interpolate(copy.granted, { name: by, sessions: plural(locale, referral.referrerSessions, copy.sessions) }) : null,
            referral.refereeSessions > 0 ? interpolate(copy.granted, { name: friend, sessions: plural(locale, referral.refereeSessions, copy.sessions) }) : null,
          ].filter(Boolean);
          return (
            <ListRow
              key={referral.id}
              avatar={{ name: friend }}
              title={friend}
              subtitle={[interpolate(copy.invitedBy, { name: by }), ...granted].join(" · ")}
              value={state}
              trailing={
                referral.status === "pending" ? (
                  <Button size="sm" variant="secondary" onClick={() => setDeclining(referral)}>
                    {copy.decline}
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </ListGroup>
      <Sheet
        open={declining !== null}
        onOpenChange={(open) => (open ? null : setDeclining(null))}
        title={copy.declineConfirm}
        description={copy.declineText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={decline}>
              {copy.decline}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setDeclining(null)}>
              {copy.keepReferral}
            </Button>
          </>
        }
      />
    </>
  );
}
