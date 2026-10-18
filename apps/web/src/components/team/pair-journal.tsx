import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadPairJournal } from "@/lib/delegations/load";

/** The pair's journal of delegates on the client card (PRD wave-3 §1 rule 8, 1.9); nothing when no one acted. */
export async function PairDelegateJournal({ coachingId }: { coachingId: string }) {
  const [t, locale, journal] = await Promise.all([getDictionary(), getLocale(), loadPairJournal(coachingId)]);
  if (!journal || journal.entries.length === 0) return null;
  const copy = t.team;
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: journal.timeZone,
  });
  const actions = copy.journalActions;
  const action = (value: string) =>
    value in actions ? actions[value as keyof typeof actions] : value.startsWith("booking:") ? actions.booking : value;
  return (
    <ListGroup header={copy.pairJournal} footer={copy.pairJournalFooter} headingLevel={2}>
      {journal.entries.map((entry, index) => (
        <ListRow
          key={`${entry.at}-${index}`}
          title={action(entry.action)}
          subtitle={interpolate(copy.journalBy, { name: entry.delegateName ?? "", when: when.format(new Date(entry.at)) })}
        />
      ))}
    </ListGroup>
  );
}
