import { Trophy } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { shareOfMetric, type Challenge } from "@/lib/challenges/challenges";
import { loadMyChallenge, loadMyChallenges, loadTrainerChallenge } from "@/lib/challenges/load";
import { challengePeriod, challengeScore } from "@/lib/challenges/present";
import { ChallengeBoard } from "./board";
import { CancelChallengeButton } from "./cancel-challenge";
import { STATE_TONE } from "./group-challenges";
import { JoinChallenge, LeaderboardSettings, LeaveChallenge } from "./participate";

export const challengePath = (challengeId: string) => `/client/challenges/${challengeId}`;

/** Title, state, metric, dates and goal of a challenge. */
function Heading({ t, locale, challenge, by }: { t: Dictionary; locale: Locale; challenge: Challenge; by: string }) {
  const copy = t.challenges;
  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-title-2">{challenge.title}</h1>
        <Badge tone={STATE_TONE[challenge.state]}>{copy.states[challenge.state]}</Badge>
      </div>
      <p className="text-callout text-ink-2">{by}</p>
      <p className="text-callout">
        {copy.metrics[challenge.metric]}, {challengePeriod(copy, locale, challenge.startsOn, challenge.endsOn)}
      </p>
      <p className="text-footnote text-ink-2">{copy.metricHints[challenge.metric]}</p>
      {challenge.goal !== null ? (
        <p className="text-callout">{interpolate(copy.goal, { goal: challengeScore(copy, locale, challenge.metric, challenge.goal) })}</p>
      ) : null}
    </div>
  );
}

function NotFound({ t, side }: { t: Dictionary; side: "trainer" | "client" }) {
  const copy = side === "trainer" ? t.challenges.trainer : t.challenges.client;
  return (
    <EmptyState
      icon={Trophy}
      title={copy.notFound}
      description={copy.notFoundText}
      action={
        <Link href={side === "trainer" ? "/trainer/groups" : "/client/progress"} className={buttonVariants({ variant: "secondary" })}>
          {copy.back}
        </Link>
      }
    />
  );
}

/** The trainer's challenge (screens.md /trainer/groups/[groupId]/challenges/[challengeId]): every participant. */
export async function TrainerChallengeView({ challengeId }: { challengeId: string }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerChallenge(challengeId)]);
  if (!data) return <NotFound t={t} side="trainer" />;
  const copy = t.challenges;
  const { challenge } = data;
  return (
    <div className="flex flex-col gap-8">
      <Heading t={t} locale={locale} challenge={challenge} by={interpolate(copy.trainer.group, { name: data.groupName })} />
      <ChallengeBoard
        t={t}
        locale={locale}
        metric={challenge.metric}
        rows={data.board}
        header={copy.trainer.board}
        empty={copy.trainer.boardEmpty}
        side="trainer"
      />
      {challenge.state === "upcoming" || challenge.state === "active" ? (
        <div>
          <CancelChallengeButton challengeId={challenge.id} title={challenge.title} />
        </div>
      ) : null}
    </div>
  );
}

/** The client's challenge (screens.md /client/challenges/[challengeId]): joining, the score, the leaderboard. */
export async function ClientChallengeView({ challengeId }: { challengeId: string }) {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadMyChallenge(challengeId)]);
  if (!data) return <NotFound t={t} side="client" />;
  const copy = t.challenges;
  const { challenge, board } = data;
  const open = challenge.state === "upcoming" || challenge.state === "active";
  const by = interpolate(copy.client.from, { name: challenge.trainerName });
  if (!challenge.joined) {
    return (
      <div className="flex flex-col gap-6">
        <Heading t={t} locale={locale} challenge={challenge} by={by} />
        {open ? (
          <JoinChallenge
            challengeId={challenge.id}
            coachingId={challenge.coachingId}
            share={shareOfMetric(challenge.metric)}
            shared={challenge.shared}
            leaderboard={challenge.leaderboard}
          />
        ) : (
          <p className="px-1 text-callout text-ink-2">{copy.client.closed}</p>
        )}
      </div>
    );
  }
  const mine = board.find((row) => row.isMe);
  const others = board.some((row) => !row.isMe);
  return (
    <div className="flex flex-col gap-8">
      <Heading t={t} locale={locale} challenge={challenge} by={by} />
      <ListGroup headingLevel={2}>
        <ListRow title={copy.client.yourScore} value={challengeScore(copy, locale, challenge.metric, challenge.score ?? 0)} />
        {mine && challenge.leaderboard ? <ListRow title={interpolate(copy.client.yourPlace, { place: mine.place })} /> : null}
      </ListGroup>
      {mine?.hidden ? <p className="px-1 text-callout text-ink-2">{copy.client.hiddenMine}</p> : null}
      {challenge.leaderboard && others ? (
        <ChallengeBoard t={t} locale={locale} metric={challenge.metric} rows={board} header={copy.client.board} empty="" side="client" />
      ) : (
        <p className="px-1 text-callout text-ink-2">{challenge.leaderboard ? copy.client.onlyYou : copy.client.boardOff}</p>
      )}
      {open ? (
        <div className="flex flex-wrap gap-2">
          {challenge.leaderboard ? <LeaderboardSettings challengeId={challenge.id} show={challenge.showOnLeaderboard} alias={challenge.alias} /> : null}
          <LeaveChallenge challengeId={challenge.id} title={challenge.title} />
        </div>
      ) : null}
    </div>
  );
}

/** "Челленджи" on the client's "Прогресс": invitations and the ones they are in. Nothing when there are none. */
export async function ClientChallengesEntry({ t, locale }: { t: Dictionary; locale: Locale }) {
  const challenges = (await loadMyChallenges()).filter((challenge) => challenge.joined || challenge.state === "upcoming" || challenge.state === "active");
  if (challenges.length === 0) return null;
  const copy = t.challenges;
  return (
    <ListGroup header={copy.client.entry} headingLevel={3}>
      {challenges.map((challenge) => (
        <ListRow
          key={challenge.id}
          icon={Trophy}
          title={challenge.title}
          subtitle={[copy.metrics[challenge.metric], challengePeriod(copy, locale, challenge.startsOn, challenge.endsOn)].join(", ")}
          trailing={
            challenge.joined ? (
              <Badge tone={STATE_TONE[challenge.state]}>{challenge.state === "finished" ? copy.states.finished : copy.client.joined}</Badge>
            ) : (
              <Badge tone="accent">{copy.client.invited}</Badge>
            )
          }
          href={challengePath(challenge.id)}
          chevron
        />
      ))}
    </ListGroup>
  );
}
