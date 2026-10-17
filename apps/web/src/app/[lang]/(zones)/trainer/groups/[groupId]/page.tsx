import type { Metadata } from "next";
import { Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { GroupChallenges } from "@/components/challenges/group-challenges";
import { BroadcastComposer, DeleteBroadcastButton } from "@/components/groups/broadcast";
import { ArchiveGroupButton, GroupFormButton } from "@/components/groups/group-form";
import { ClearGroupTargetButton, GroupTargetForm } from "@/components/groups/group-target";
import { AddMembers, MemberActions } from "@/components/groups/members";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadGroup, type GroupDetails } from "@/lib/groups/load";
import { isPairId } from "@/lib/pairs/clients";
import { formatValue } from "@/lib/progress/measurements";

// The shell reads the route segments (AppShell), and a group id is known only at request time.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerGroups.title };
}

type Copy = Dictionary["trainerGroups"];

function Members({ copy, details }: { copy: Copy; details: GroupDetails }) {
  const { group, members, candidates } = details;
  return (
    <section className="flex flex-col gap-3">
      <ListGroup header={copy.member.header} headingLevel={2}>
        {members.length === 0 ? <ListRow title={copy.member.empty} /> : null}
        {members.map((member) => (
          <ListRow
            key={member.coachingId}
            title={<Link href={`/trainer/clients/${member.coachingId}`}>{member.name}</Link>}
            subtitle={[
              member.goal ? copy.goals[member.goal] : null,
              details.template && member.otherTemplateGroups > 0 ? (member.primary ? copy.member.primary : copy.member.otherPrimary) : null,
            ]
              .filter(Boolean)
              .join(", ")}
            trailing={
              <MemberActions
                groupId={group.id}
                coachingId={member.coachingId}
                name={member.name}
                canMakePrimary={Boolean(details.template) && member.otherTemplateGroups > 0 && !member.primary}
              />
            }
          />
        ))}
      </ListGroup>
      <div>
        <AddMembers groupId={group.id} groupGoal={group.goal} candidates={candidates} />
      </div>
    </section>
  );
}

function Template({ copy, locale, details }: { copy: Copy["template"]; locale: Locale; details: GroupDetails }) {
  const { template } = details;
  const dash = "–";
  const number = (value: number | null) => (value === null ? dash : formatValue(locale, value));
  return (
    <section className="flex flex-col gap-3">
      <ListGroup header={copy.header} footer={copy.footer} headingLevel={2}>
        {template ? (
          <>
            <ListRow title={interpolate(copy.value, { kcal: formatValue(locale, template.kcal) })} subtitle={template.proteinG === null && template.fatG === null && template.carbsG === null ? undefined : interpolate(copy.macros, { protein: number(template.proteinG), fat: number(template.fatG), carbs: number(template.carbsG) })} />
            {template.waterMl !== null || template.steps !== null ? (
              <ListRow title={interpolate(copy.waterSteps, { water: number(template.waterMl), steps: number(template.steps) })} />
            ) : null}
          </>
        ) : (
          <ListRow title={copy.none} />
        )}
      </ListGroup>
      <div className="flex flex-wrap gap-2">
        <GroupTargetForm groupId={details.group.id} current={template} impact={details.impact} />
        {template ? <ClearGroupTargetButton groupId={details.group.id} /> : null}
      </div>
    </section>
  );
}

function Analytics({ copy, locale, details }: { copy: Copy["analytics"]; locale: Locale; details: GroupDetails }) {
  const { analytics } = details;
  const change = analytics.weightChangeKg;
  return (
    <ListGroup header={copy.header} footer={copy.footer} headingLevel={2}>
      <ListRow title={copy.members} value={analytics.members} />
      <ListRow
        title={copy.attendance}
        value={analytics.attendance === null ? copy.few : interpolate(copy.attendanceValue, { share: Math.round(analytics.attendance * 100) })}
      />
      <ListRow
        title={copy.weight}
        value={change === null ? copy.few : interpolate(copy.weightValue, { change: `${change > 0 ? "+" : ""}${formatValue(locale, change)}` })}
      />
      <ListRow
        title={copy.adherence}
        value={analytics.adherence === null ? copy.few : interpolate(copy.adherenceValue, { share: analytics.adherence })}
      />
    </ListGroup>
  );
}

function Broadcasts({ copy, locale, details }: { copy: Copy["broadcast"]; locale: Locale; details: GroupDetails }) {
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: details.timeZone });
  return (
    <section className="flex flex-col gap-4">
      <h2 className="px-1 text-headline">{copy.header}</h2>
      <BroadcastComposer groupId={details.group.id} sentToday={details.broadcastsToday} />
      <ListGroup header={copy.history} headingLevel={3}>
        {details.broadcasts.length === 0 ? <ListRow title={copy.historyEmpty} /> : null}
        {details.broadcasts.map((broadcast) => {
          const when = date.format(new Date(broadcast.createdAt));
          const parts = [
            interpolate(copy.stats, { sent: broadcast.sent, recipients: broadcast.recipients }),
            broadcast.deferred ? interpolate(copy.deferred, { count: broadcast.deferred }) : null,
            broadcast.undelivered ? interpolate(copy.undelivered, { count: broadcast.undelivered }) : null,
            broadcast.muted ? interpolate(copy.muted, { count: broadcast.muted }) : null,
          ];
          const button =
            broadcast.buttonKind === "deep_link" ? copy.withButton : broadcast.buttonKind === "url" && broadcast.buttonUrl ? interpolate(copy.withLink, { url: broadcast.buttonUrl }) : null;
          return (
            <ListRow
              key={broadcast.id}
              title={<span className="line-clamp-3 whitespace-pre-line">{broadcast.body}</span>}
              subtitle={
                <span className="flex flex-col">
                  <span>{when}</span>
                  <span>{parts.filter(Boolean).join(", ")}</span>
                  {button ? <span className="break-all">{button}</span> : null}
                </span>
              }
              trailing={<DeleteBroadcastButton broadcastId={broadcast.id} label={interpolate(copy.deleteLabel, { date: when })} />}
            />
          );
        })}
      </ListGroup>
    </section>
  );
}

async function Group({ params }: { params: PageProps<"/[lang]/trainer/groups/[groupId]">["params"] }) {
  const [t, locale, { groupId }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.trainerGroups;
  const details = isPairId(groupId) ? await loadGroup(groupId) : null;
  if (!details) {
    return (
      <EmptyState
        icon={Users}
        title={copy.notFound}
        description={copy.notFoundText}
        action={
          <Link href="/trainer/groups" className={buttonVariants({ variant: "secondary" })}>
            {copy.back}
          </Link>
        }
      />
    );
  }
  const { group, access } = details;
  if (!access.groups) {
    return <TierLock plan="trainer_pro" title={copy.lockTitle} description={copy.lockText} feature="trainer.groups" requested={access.requested} />;
  }
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 px-1">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-3 shrink-0 rounded-full bg-surface-3" style={group.color ? { backgroundColor: group.color } : undefined} />
          <h1 className="text-title-2">{group.name}</h1>
        </div>
        <p className="text-callout text-ink-2">{[group.goal ? copy.goals[group.goal] : null, interpolate(copy.members, { count: details.members.length })].filter(Boolean).join(", ")}</p>
        {group.description ? <p className="text-callout whitespace-pre-line">{group.description}</p> : null}
      </div>
      <Members copy={copy} details={details} />
      <Template copy={copy.template} locale={locale} details={details} />
      <GroupChallenges groupId={group.id} />
      <Analytics copy={copy.analytics} locale={locale} details={details} />
      {access.broadcasts ? (
        <Broadcasts copy={copy.broadcast} locale={locale} details={details} />
      ) : (
        <TierLock plan="trainer_pro" title={copy.broadcast.lockTitle} description={copy.broadcast.lockText} feature="trainer.broadcasts" requested={access.requested} />
      )}
      <div className="flex flex-wrap gap-2">
        <GroupFormButton initial={group} variant="secondary" />
        <ArchiveGroupButton groupId={group.id} name={group.name} />
      </div>
    </div>
  );
}

/** «Группа» (PRD wave-2 §6, screens.md /trainer/groups/[groupId]): members, template, analytics, broadcasts. */
export default async function TrainerGroupPage(props: PageProps<"/[lang]/trainer/groups/[groupId]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerGroups.title} back={{ fallbackHref: "/trainer/groups" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={8} label={t.common.loading} />}>
          <Group params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
