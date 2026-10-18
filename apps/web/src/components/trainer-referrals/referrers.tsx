import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate } from "@/i18n/format";
import { getDictionary } from "@/i18n/server";
import { loadTrainerReferrers } from "@/lib/trainer-referrals/load";

/**
 * Trainers who invite trainers, for /admin/invites (marketing backlog 6): per trainer, how many colleagues came,
 * how many are working and their bonuses, the same numbers the trainer sees on "Пригласить тренера".
 */
export async function TrainerReferrers() {
  const [t, referrers] = await Promise.all([getDictionary(), loadTrainerReferrers()]);
  const copy = t.trainerReferrals.admin.referrers;
  return (
    <ListGroup header={copy.header} footer={copy.footer} headingLevel={2}>
      {referrers.length ? (
        referrers.map((referrer) => (
          <ListRow
            key={referrer.trainerId}
            avatar={{ name: referrer.name ?? copy.unnamed }}
            title={referrer.name ?? copy.unnamed}
            subtitle={
              <>
                {interpolate(copy.line, { invited: referrer.invited, active: referrer.active })}
                <br />
                {interpolate(copy.bonuses, { pending: referrer.bonusesPending, granted: referrer.bonusesGranted })}
              </>
            }
          />
        ))
      ) : (
        <p className="px-4 py-3 text-subhead text-ink-2">{copy.empty}</p>
      )}
    </ListGroup>
  );
}
