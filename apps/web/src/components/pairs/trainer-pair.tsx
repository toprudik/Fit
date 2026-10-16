import { CalendarDays, MessageCircle, Plus, Ticket, Wallet } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural } from "@/i18n/format";
import type { Locale } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDay, formatNoteTime, formatSessionTime } from "@/lib/pairs/format";
import { loadPair, type PairDetail } from "@/lib/pairs/load";
import { NoteComposer, NoteItem, NoteVisibility } from "./notes";
import { PairTabs } from "./pair-tabs";
import { ArchiveRow, DebtBookingSwitch, EndPairRow } from "./pair-controls";

type Tab = "overview" | "notes";

/** "34 занятия вместе, с 3 марта" under the name. */
export function pairSubtitle(t: Dictionary, locale: Locale, pair: PairDetail): string {
  const since = interpolate(t.pairs.since, { date: formatDay(locale, pair.startedAt, pair.timeZone) });
  return pair.attended > 0 ? `${plural(locale, pair.attended, t.pairs.together)}, ${since}` : since;
}

/** A short notice on surface-1 above the card's content: an ended pair, the archive, a card without an account. */
export function PairNotice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{children}</p>;
}

/** "Написать": Telegram chat with the person (PRIV-1); without a username the contact request comes later. */
export function WriteButton({ t, username }: { t: Dictionary; username: string | null }) {
  if (!username) return null;
  return (
    <IconButton asChild icon={MessageCircle} label={t.pairs.write}>
      <a href={`https://t.me/${encodeURIComponent(username)}`} target="_blank" rel="noopener noreferrer" />
    </IconButton>
  );
}

export function PassRows({ t, locale, pair }: { t: Dictionary; locale: Locale; pair: PairDetail }) {
  if (!pair.passes.length) return <ListRow icon={Ticket} title={t.pairs.noPass} />;
  return pair.passes.map((pass) => (
    <ListRow
      key={pass.id}
      icon={Ticket}
      title={pass.title}
      subtitle={[
        interpolate(t.pairs.passLeft, { available: pass.available, total: pass.sessionsTotal }),
        pass.expiresAt ? interpolate(t.pairs.passUntil, { date: formatDay(locale, pass.expiresAt, pair.timeZone) }) : null,
        pass.status === "frozen" ? t.pairs.passFrozen : null,
      ]
        .filter(Boolean)
        .join(", ")}
    />
  ));
}

function Overview({ t, locale, pair }: { t: Dictionary; locale: Locale; pair: PairDetail }) {
  const live = pair.status !== "ended";
  const base = `/trainer/clients/${pair.coachingId}`;
  const latest = pair.notes[0];
  return (
    <div className="flex flex-col gap-6">
      {live ? (
        <div className="grid grid-cols-3 gap-2 md:max-w-md">
          <Link
            href={`${base}/notes#new-note`}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg bg-surface-1 px-2 py-3 text-footnote font-semibold hover:bg-surface-3"
          >
            <Plus aria-hidden size={22} strokeWidth={1.75} className="text-accent-ink" />
            {t.pairs.addNote}
          </Link>
        </div>
      ) : null}

      <ListGroup>
        <ListRow
          icon={CalendarDays}
          iconTone="accent"
          title={pair.nextSessionAt ? formatSessionTime(locale, pair.nextSessionAt, pair.timeZone) : t.pairs.noNextSession}
          subtitle={pair.nextSessionAt ? t.pairs.nextSession : undefined}
        />
        <ListRow
          icon={Wallet}
          title={t.pairs.debt}
          value={pair.debtSessions > 0 ? plural(locale, pair.debtSessions, t.pairs.debtSessions) : t.pairs.noDebt}
        />
      </ListGroup>

      <ListGroup header={t.pairs.passes}>
        <PassRows t={t} locale={locale} pair={pair} />
      </ListGroup>

      {latest ? (
        <section aria-labelledby="latest-note" className="flex flex-col gap-1.5">
          <h2 id="latest-note" className="px-4 text-footnote text-ink-2">
            {t.pairs.latestNote}
          </h2>
          <Link href={`${base}/notes`} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4 hover:bg-surface-3">
            <NoteVisibility visible={latest.visibleToClient} />
            <p className="line-clamp-4 text-body break-words whitespace-pre-wrap">{latest.body}</p>
            <span className="text-subhead text-accent-ink">{t.pairs.allNotes}</span>
          </Link>
        </section>
      ) : null}

      {live ? (
        <ListGroup>
          <DebtBookingSwitch coachingId={pair.coachingId} enabled={pair.selfBookOnDebt} />
        </ListGroup>
      ) : null}

      {live ? (
        <ListGroup header={t.pairs.actions}>
          <ArchiveRow coachingId={pair.coachingId} archived={pair.archived} />
          <EndPairRow coachingId={pair.coachingId} side="trainer" partnerName={pair.partner.name || t.botMessages.unnamedClient} />
        </ListGroup>
      ) : null}
    </div>
  );
}

function Notes({ t, locale, pair }: { t: Dictionary; locale: Locale; pair: PairDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <NoteComposer coachingId={pair.coachingId} />
      {pair.notes.length === 0 ? (
        <div className="flex flex-col gap-1 px-1 pt-2">
          <h2 className="text-headline">{t.pairs.notes.empty}</h2>
          <p className="text-subhead text-ink-2">{t.pairs.notes.emptyText}</p>
        </div>
      ) : null}
      {pair.notes.map((note) => (
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
    </div>
  );
}

/**
 * Client card of the trainer (screens.md "Карточка пары"): header with the name, "вместе с …" and
 * "Написать", the sections as tabs, then the open section. Not the trainer's pair → 404.
 */
export async function TrainerPair({ coachingId, tab }: { coachingId: string; tab: Tab }) {
  const [t, locale, pair] = await Promise.all([getDictionary(), getLocale(), loadPair(coachingId, "trainer")]);
  if (!pair) notFound();
  const base = `/trainer/clients/${pair.coachingId}`;
  const name = pair.partner.name || t.botMessages.unnamedClient;

  return (
    <Screen
      header={
        <ScreenHeader
          title={name}
          subtitle={pairSubtitle(t, locale, pair)}
          back={{ fallbackHref: "/trainer/clients" }}
          actions={<WriteButton t={t} username={pair.partner.username} />}
        />
      }
    >
      <div className="flex flex-col gap-4 pt-3 md:pt-0">
        {pair.status === "ended" ? (
          <PairNotice>
            {interpolate(t.pairs.end.endedTrainer, { date: formatDay(locale, pair.endedAt ?? pair.startedAt, pair.timeZone) })}
          </PairNotice>
        ) : pair.archived ? (
          <PairNotice>{t.pairs.archivedText}</PairNotice>
        ) : null}
        {pair.partner.isCard ? <PairNotice>{t.pairs.cardText}</PairNotice> : null}
        <PairTabs
          label={t.pairs.tabsLabel}
          tabs={[
            { href: base, label: t.pairs.tabs.overview, current: tab === "overview" },
            { href: `${base}/notes`, label: t.pairs.tabs.notes, current: tab === "notes" },
          ]}
        />
        {tab === "overview" ? <Overview t={t} locale={locale} pair={pair} /> : <Notes t={t} locale={locale} pair={pair} />}
      </div>
    </Screen>
  );
}
