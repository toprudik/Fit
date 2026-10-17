import { History } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { INTL_LOCALE } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import type { BookingHistoryItem } from "@/lib/bookings/history";

type Props = {
  items: BookingHistoryItem[];
  timeZone: string;
  /** On a group session: the client of each booking, named in front of its rows. */
  clients?: Map<string, string>;
  header?: string;
};

/** «История записи» (PRD wave-1 SCHED-22): what changed, who did it, when and why, newest first. */
export async function BookingHistory({ items, timeZone, clients, header }: Props) {
  if (items.length === 0) return null;
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.schedule.booking.history;
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });

  return (
    <ListGroup header={header ?? copy.header}>
      {[...items].reverse().map((item) => {
        const client = clients?.get(item.bookingId);
        const who = item.role === "system" ? copy.roles.system : (item.actor ?? copy.roles[item.role]);
        return (
          <ListRow
            key={item.id}
            icon={History}
            title={client ? `${client}: ${copy.changes[item.change]}` : copy.changes[item.change]}
            subtitle={
              <>
                <span className="tabular-nums">{`${who}, ${when.format(new Date(item.at))}`}</span>
                {item.reason ? <span className="block">{`${copy.reason}: ${item.reason}`}</span> : null}
              </>
            }
          />
        );
      })}
    </ListGroup>
  );
}
