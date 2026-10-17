import { Gift } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate, plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { clientReferralPath } from "@/lib/referrals/link";
import { loadClientReferral } from "@/lib/referrals/load";

/** «Приведи друга» on the client's card of a trainer, while that trainer runs an offer (PRD wave-3 §3.1-3). */
export async function ClientReferralRow({ coachingId }: { coachingId: string }) {
  const [t, locale, referral] = await Promise.all([getDictionary(), getLocale(), loadClientReferral(coachingId)]);
  if (!referral) return null;
  const copy = t.referrals.client;
  return (
    <ListGroup>
      <ListRow
        icon={Gift}
        iconTone="accent"
        title={copy.row}
        subtitle={interpolate(copy.rowText, { sessions: plural(locale, referral.referrerSessions, t.referrals.sessions) })}
        href={clientReferralPath(coachingId)}
      />
    </ListGroup>
  );
}
