import type { Metadata } from "next";
import { Suspense } from "react";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { AddAssistantButton, RevokeButton, SubstituteSessionsButton } from "@/components/team/team";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadTeam, type Delegation, type JournalEntry } from "@/lib/delegations/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.team.title };
}

type Copy = Dictionary["team"];
const TONE = {
  pending: "neutral",
  active: "success",
  declined: "neutral",
  revoked: "neutral",
  expired: "neutral",
} as const;

function formatters(locale: Locale, timeZone: string) {
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    timeZone,
  });
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const short = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return {
    day: (value: string) => day.format(new Date(value)),
    when: (value: string) => when.format(new Date(value)),
    short: (value: string) => short.format(new Date(value)),
  };
}

function Row({ copy, row, format }: { copy: Copy; row: Delegation; format: ReturnType<typeof formatters> }) {
  const live = row.status === "pending" || row.status === "active";
  const name = row.side === "owner" ? (row.otherName ?? copy.waitingInvite) : interpolate(copy.from, { name: row.otherName ?? "" });
  const reach =
    row.kind === "substitute"
      ? row.sessionStartsAt
        ? interpolate(copy.sessionAt, {
            when: format.when(row.sessionStartsAt),
          })
        : null
      : [
          row.allClients ? copy.allClients : interpolate(copy.clientsCount, { count: row.clients }),
          row.endsAt ? interpolate(copy.until, { date: format.day(row.endsAt) }) : copy.noEnd,
          row.scopes.map((scope) => (scope in copy.scopes ? copy.scopes[scope as keyof Copy["scopes"]] : scope).toLowerCase()).join(", "),
        ].join(", ");
  const href =
    row.side === "delegate" && row.kind === "substitute" && row.status === "active" && row.sessionId ? `/trainer/team/sessions/${row.sessionId}` : undefined;
  return (
    <ListRow
      href={href}
      title={name}
      subtitle={
        <span className="flex flex-col gap-1">
          {reach ? <span className="whitespace-normal">{reach}</span> : null}
          <span>
            <Badge tone={TONE[row.status]}>{copy.statuses[row.status]}</Badge>
          </span>
        </span>
      }
      trailing={live && !href ? <RevokeButton delegationId={row.id} name={row.otherName ?? copy.waitingInvite} /> : undefined}
    />
  );
}

function journalAction(copy: Copy, action: string) {
  const actions = copy.journalActions;
  if (action in actions) return actions[action as keyof Copy["journalActions"]];
  return action.startsWith("booking:") ? actions.booking : action;
}

function Journal({ copy, entries, format }: { copy: Copy; entries: JournalEntry[]; format: ReturnType<typeof formatters> }) {
  return (
    <ListGroup header={copy.journal} footer={copy.journalFooter} headingLevel={2}>
      {entries.length === 0 ? <ListRow title={copy.journalEmpty} /> : null}
      {entries.map((entry, index) => (
        <ListRow
          key={`${entry.at}-${index}`}
          title={interpolate(copy.journalEntry, { action: journalAction(copy, entry.action), client: entry.clientName ?? "" })}
          subtitle={interpolate(copy.journalBy, { name: entry.delegateName ?? "", when: format.when(entry.at) })}
        />
      ))}
    </ListGroup>
  );
}

async function Team() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTeam()]);
  if (!data) return null;
  const copy = t.team;
  const format = formatters(locale, data.timeZone);
  const mine = data.delegations.filter((row) => row.side === "owner");
  const assistants = mine.filter((row) => row.kind === "assistant");
  const substitutes = mine.filter((row) => row.kind === "substitute");
  const toMe = data.delegations.filter((row) => row.side === "delegate");
  return (
    <div className="flex flex-col gap-8">
      <p className="px-1 text-callout text-ink-2">{copy.lead}</p>
      {data.canDelegate ? (
        <>
          <section className="flex flex-col gap-3">
            <ListGroup header={copy.assistants} headingLevel={2}>
              {assistants.length === 0 ? <ListRow title={copy.assistantsEmpty} /> : null}
              {assistants.map((row) => (
                <Row key={row.id} copy={copy} row={row} format={format} />
              ))}
            </ListGroup>
            <div>
              <AddAssistantButton clients={data.clients} />
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <ListGroup header={copy.substitutes} footer={copy.substitute.text} headingLevel={2}>
              {substitutes.length === 0 ? <ListRow title={copy.substitutesEmpty} /> : null}
              {substitutes.map((row) => (
                <Row key={row.id} copy={copy} row={row} format={format} />
              ))}
            </ListGroup>
            {data.sessions.length > 0 ? (
              <div>
                <SubstituteSessionsButton
                  sessions={data.sessions.map((session) => ({
                    id: session.id,
                    label: [format.short(session.startsAt), session.title].filter(Boolean).join(", "),
                  }))}
                />
              </div>
            ) : null}
          </section>
          {mine.length > 0 || data.journal.length > 0 ? <Journal copy={copy} entries={data.journal} format={format} /> : null}
        </>
      ) : (
        <TierLock plan="trainer_pro" title={copy.lockTitle} description={copy.lockText} feature="trainer.delegation" requested={data.requested} />
      )}
      <ListGroup header={copy.delegatedToMe} headingLevel={2}>
        {toMe.length === 0 ? <ListRow title={copy.delegatedEmpty} /> : null}
        {toMe.map((row) => (
          <Row key={row.id} copy={copy} row={row} format={format} />
        ))}
      </ListGroup>
    </div>
  );
}

/** «Команда» (screens.md /trainer/team, PRD wave-3 §1): assistants, substitutes, and what others handed to me. */
export default async function TeamPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.team.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <Team />
        </Suspense>
      </div>
    </Screen>
  );
}
