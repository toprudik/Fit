import { ClipboardCheck, Ruler, ShieldOff, Users } from "lucide-react";
import { STATE_TONE } from "@/components/homework/trainer-homework";
import { NoteComposer, NoteItem } from "@/components/pairs/notes";
import { MeasurementChart } from "@/components/progress/measurement-chart";
import { MeasurementHistory } from "@/components/progress/measurement-history";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import {
  loadAssistedHomework,
  loadAssistedMeasurements,
  loadAssistedNotes,
  loadAssistedOwners,
  loadAssistedPair,
  type AssistedPair,
  type Scope,
} from "@/lib/delegations/assistant";
import { homeworkSchedule } from "@/lib/homework/format";
import { occurrenceState } from "@/lib/homework/homework";
import { formatNoteTime } from "@/lib/pairs/format";

export const DELEGATED_HREF = "/trainer/clients/delegated";

/** «Мои клиенты» / «Делегировано мне» above the list (PRD wave-3 §1 rule 10); shown only to an assistant. */
export function ClientsSwitch({ t, current }: { t: Dictionary; current: "mine" | "delegated" }) {
  const copy = t.delegatedZone;
  return (
    <ChipRow label={copy.switchLabel} className="pb-3">
      <Chip href="/trainer/clients" selected={current === "mine"}>
        {copy.mine}
      </Chip>
      <Chip href={DELEGATED_HREF} selected={current === "delegated"}>
        {copy.delegated}
      </Chip>
    </ChipRow>
  );
}

/** What the delegation lets the caller do, in the words of «Команда». Money is never delegated (rule 3). */
function accessLine(t: Dictionary, scopes: Scope[]): string {
  const labels = t.team.scopes;
  const list = scopes.filter((scope): scope is keyof typeof labels => scope in labels).map((scope) => labels[scope].toLowerCase());
  return interpolate(t.delegatedZone.access, { list: list.join(", ") });
}

function dayFormat(locale: Locale, timeZone?: string) {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone });
}

/** «Делегировано мне»: one group per owner trainer with the clients the delegation covers. */
export async function DelegatedList({ selectedId }: { selectedId?: string }) {
  const [t, locale, owners] = await Promise.all([getDictionary(), getLocale(), loadAssistedOwners()]);
  const copy = t.delegatedZone;
  if (!owners?.length) return <EmptyState icon={Users} title={copy.emptyTitle} description={copy.emptyText} />;
  const day = dayFormat(locale);
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-subhead text-ink-2">{copy.intro}</p>
      {owners.map((owner) => (
        <ListGroup
          key={owner.delegationId}
          header={interpolate(copy.from, { name: owner.ownerName || copy.noName })}
          footer={[accessLine(t, owner.scopes), owner.endsAt ? interpolate(copy.until, { date: day.format(new Date(owner.endsAt)) }) : null]
            .filter(Boolean)
            .join(", ")}
        >
          {owner.clients.length === 0 ? <ListRow title={copy.noClients} /> : null}
          {owner.clients.map((client) => (
            <ListRow
              key={client.coachingId}
              avatar={{ name: client.name || copy.noName }}
              title={client.name || copy.noName}
              href={`${DELEGATED_HREF}/${client.coachingId}`}
              className={client.coachingId === selectedId ? "bg-surface-3" : undefined}
            />
          ))}
        </ListGroup>
      ))}
    </div>
  );
}

async function Progress({ t, pair }: { t: Dictionary; pair: AssistedPair }) {
  const copy = t.delegatedZone;
  const measurements = await loadAssistedMeasurements(pair);
  if (!measurements.entries.length) {
    return <EmptyState icon={Ruler} title={copy.progressEmptyTitle} description={copy.progressEmptyText} headingLevel={2} />;
  }
  return (
    <section className="flex flex-col gap-3" aria-labelledby="assisted-progress">
      <h2 id="assisted-progress" className="px-1 text-headline">
        {copy.progress}
      </h2>
      <MeasurementChart entries={measurements.entries} today={measurements.today} />
      <MeasurementHistory entries={measurements.entries} today={measurements.today} />
    </section>
  );
}

async function Homework({ t, locale, pair }: { t: Dictionary; locale: Locale; pair: AssistedPair }) {
  const copy = t.delegatedZone;
  const { today, homework } = await loadAssistedHomework(pair);
  return (
    <ListGroup header={copy.homework}>
      {homework.length === 0 ? <ListRow title={copy.homeworkEmpty} /> : null}
      {homework.map((item) => {
        const state = item.current ? occurrenceState(item.current, today) : null;
        return (
          <ListRow
            key={item.id}
            icon={ClipboardCheck}
            title={item.title}
            subtitle={homeworkSchedule(t, locale, item)}
            trailing={state ? <Badge tone={STATE_TONE[state]}>{t.homework.state[state]}</Badge> : undefined}
          />
        );
      })}
    </ListGroup>
  );
}

async function Notes({ t, locale, pair }: { t: Dictionary; locale: Locale; pair: AssistedPair }) {
  const copy = t.delegatedZone;
  const notes = await loadAssistedNotes(pair);
  return (
    <section className="flex flex-col gap-4" aria-labelledby="assisted-notes">
      <h2 id="assisted-notes" className="px-1 text-headline">
        {copy.notes}
      </h2>
      <NoteComposer coachingId={pair.coachingId} />
      {notes.length === 0 ? <p className="px-1 text-subhead text-ink-2">{copy.notesEmpty}</p> : null}
      {notes.map((note) => (
        <NoteItem
          key={note.id}
          note={{
            id: note.id,
            body: note.body,
            visibleToClient: note.visibleToClient,
            createdLabel: formatNoteTime(locale, note.createdAt, pair.timeZone),
            mine: note.mine,
          }}
        />
      ))}
    </section>
  );
}

/**
 * The client card for an assistant (PRD wave-3 §1 rules 3 and 10): progress, homework and notes, each only
 * when the delegation gives that scope. A pair no live delegation covers gets a quiet empty state, not a 404,
 * since the owner may have just taken the client back.
 */
export async function AssistedCard({ coachingId }: { coachingId: string }) {
  const [t, locale, pair] = await Promise.all([getDictionary(), getLocale(), loadAssistedPair(coachingId)]);
  const copy = t.delegatedZone;
  const back = { fallbackHref: DELEGATED_HREF };
  if (!pair) {
    return (
      <Screen header={<ScreenHeader title={copy.title} back={back} />}>
        <EmptyState icon={ShieldOff} title={copy.goneTitle} description={copy.goneText} />
      </Screen>
    );
  }
  const has = (scope: Scope) => pair.scopes.includes(scope);
  return (
    <Screen
      header={
        <ScreenHeader
          title={pair.clientName || copy.noName}
          subtitle={interpolate(copy.clientOf, { name: pair.ownerName || copy.noName })}
          back={back}
        />
      }
    >
      <div className="flex w-full max-w-2xl flex-col gap-8 pt-3 md:pt-0">
        <p className="px-1 text-footnote text-ink-2">{accessLine(t, pair.scopes)}</p>
        {!has("progress") && !has("homework") && !has("notes") ? (
          <EmptyState icon={ShieldOff} title={copy.nothingTitle} description={copy.nothingText} />
        ) : null}
        {has("progress") ? <Progress t={t} pair={pair} /> : null}
        {has("homework") ? <Homework t={t} locale={locale} pair={pair} /> : null}
        {has("notes") ? <Notes t={t} locale={locale} pair={pair} /> : null}
      </div>
    </Screen>
  );
}
