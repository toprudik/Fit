import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import { plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import type { ChallengeState } from "@/lib/challenges/challenges";
import { loadGroupChallenges } from "@/lib/challenges/load";
import { challengePeriod, nextMonday, trainerChallengePath } from "@/lib/challenges/present";
import { NewChallengeButton } from "./new-challenge";

export const STATE_TONE: Record<ChallengeState, "accent" | "success" | "neutral"> = {
  upcoming: "accent",
  active: "success",
  finished: "neutral",
  cancelled: "neutral",
};

/**
 * "Челленджи" on the trainer's group (wave-3 §2.3), or with groupId null on /trainer/challenges for all clients:
 * the challenges and "Новый челлендж".
 */
export async function GroupChallenges({ groupId }: { groupId: string | null }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadGroupChallenges(groupId)]);
  if (!data) return null;
  const copy = t.challenges;
  const list = groupId ? copy.group : copy.all;
  return (
    <section className="flex flex-col gap-3">
      <ListGroup header={list.header} footer={list.footer} headingLevel={2}>
        {data.challenges.length === 0 ? <ListRow title={list.empty} /> : null}
        {data.challenges.map((challenge) => (
          <ListRow
            key={challenge.id}
            icon={Trophy}
            title={challenge.title}
            subtitle={[
              copy.metrics[challenge.metric],
              challengePeriod(copy, locale, challenge.startsOn, challenge.endsOn),
              plural(locale, challenge.participants, copy.participants),
            ].join(", ")}
            trailing={<Badge tone={STATE_TONE[challenge.state]}>{copy.states[challenge.state]}</Badge>}
            href={trainerChallengePath(groupId, challenge.id)}
            chevron
          />
        ))}
      </ListGroup>
      <div>
        <NewChallengeButton groupId={groupId} today={data.today} monday={nextMonday(data.today)} />
      </div>
    </section>
  );
}
