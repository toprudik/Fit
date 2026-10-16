import { CalendarDays, Wallet } from "lucide-react";
import { notFound } from "next/navigation";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { interpolate, plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatDay, formatNoteTime, formatSessionTime } from "@/lib/pairs/format";
import { loadPair } from "@/lib/pairs/load";
import { EndPairRow } from "./pair-controls";
import { PairNotice, PassRows, WriteButton, pairSubtitle } from "./trainer-pair";

/**
 * The client's card of one trainer (screens.md "Тренер (моя пара)"): "вместе с …", "Написать", the next
 * session, passes, debt, the notes the trainer showed (PAIR-2) and ending the pair (PRIV-5). Not the
 * caller's pair → 404.
 */
export async function ClientPair({ coachingId }: { coachingId: string }) {
  const [t, locale, pair] = await Promise.all([getDictionary(), getLocale(), loadPair(coachingId, "client")]);
  if (!pair) notFound();
  const live = pair.status !== "ended";
  const name = pair.partner.name || t.botMessages.unnamedTrainer;

  return (
    <Screen
      header={
        <ScreenHeader
          title={name}
          subtitle={pairSubtitle(t, locale, pair)}
          back={{ fallbackHref: "/client/trainers" }}
          actions={<WriteButton t={t} username={pair.partner.username} />}
        />
      }
    >
      <div className="flex flex-col gap-6 pt-3 md:pt-0">
        {live ? null : (
          <PairNotice>
            {pair.endedForLimit
              ? interpolate(t.pairs.end.endedForLimit, { name })
              : interpolate(t.pairs.end.endedClient, { date: formatDay(locale, pair.endedAt ?? pair.startedAt, pair.timeZone) })}
          </PairNotice>
        )}

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

        <section aria-labelledby="trainer-notes" className="flex flex-col gap-1.5">
          <h2 id="trainer-notes" className="px-4 text-footnote text-ink-2">
            {t.pairs.client.notes}
          </h2>
          {pair.notes.length ? (
            pair.notes.map((note) => (
              <article key={note.id} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
                <span className="text-footnote text-ink-2 tabular-nums">{formatNoteTime(locale, note.createdAt, pair.timeZone)}</span>
                <p className="text-body break-words whitespace-pre-wrap">{note.body}</p>
              </article>
            ))
          ) : (
            <p className="rounded-lg bg-surface-1 px-4 py-3 text-subhead text-ink-2">{t.pairs.client.noNotes}</p>
          )}
        </section>

        {live ? (
          <ListGroup header={t.pairs.actions}>
            <EndPairRow coachingId={pair.coachingId} side="client" partnerName={name} />
          </ListGroup>
        ) : null}
      </div>
    </Screen>
  );
}
