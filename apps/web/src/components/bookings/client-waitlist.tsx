import { Clock, Hourglass } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadClientWaitlist } from "@/lib/bookings/load";
import { loadScheduleOwner } from "@/lib/schedule/load";

/** Request time, outside the component so rendering stays pure. */
function now(): Date {
  return new Date();
}

/**
 * «Лист ожидания» on the client's home screen (QA U1): an offered place with its deadline on top, then the places in
 * line. Each opens /client/waitlist/[entryId], where the client takes the place or leaves the queue. Nothing when empty.
 */
export async function ClientWaitlist() {
  const [t, locale, owner] = await Promise.all([getDictionary(), getLocale(), loadScheduleOwner()]);
  if (!owner) return null;
  const entries = await loadClientWaitlist(owner, now());
  if (entries.length === 0) return null;
  const copy = t.schedule.waitlist;
  const intl = INTL_LOCALE[locale];
  const when = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: owner.timeZone });
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone: owner.timeZone });
  return (
    <ListGroup header={copy.title}>
      {entries.map((entry) => {
        const offered = entry.status === "offered";
        const session = [entry.session.title, when.format(new Date(entry.session.startsAt))].filter(Boolean).join(", ");
        return (
          <ListRow
            key={entry.id}
            icon={offered ? Clock : Hourglass}
            iconTone={offered ? "accent" : "default"}
            title={offered ? copy.offerTitle : interpolate(copy.homePlace, { place: entry.place ?? "" })}
            subtitle={offered ? `${interpolate(copy.homeOffer, { time: time.format(new Date(entry.offerExpiresAt!)) })}. ${session}` : session}
            href={`/client/waitlist/${entry.id}`}
          />
        );
      })}
    </ListGroup>
  );
}
