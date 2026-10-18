import type { Metadata } from "next";
import { CalendarOff } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CloseDaysForm, ReopenButton, SlotToggle } from "@/components/schedule/slot-controls";
import { WaitlistQueue } from "@/components/schedule/waitlist-queue";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadOpenSlotQueues } from "@/lib/bookings/slot-waitlist";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { addDays, formatMinutes, localParts, localToUtc, today as todayIn } from "@/lib/schedule/time";
import { isClosedMarker, type SlotRow } from "@/lib/schedule/week";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.schedule.slotsPage.title };
}

/** Request time, outside the component so rendering stays pure. */
function now(): string {
  return new Date().toISOString();
}

async function Slots() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.schedule.slotsPage;
  const owner = await loadScheduleOwner();
  if (!owner) {
    return (
      <EmptyState
        icon={CalendarOff}
        title={copy.title}
        description={t.schedule.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/schedule/slots")}`}>{t.schedule.signIn}</Link>
          </Button>
        }
      />
    );
  }

  const { supabase, userId, timeZone } = owner;
  const today = todayIn(timeZone);
  const until = localToUtc(addDays(today, 14), 0, timeZone).toISOString();
  const { data, error } = await supabase
    .from("slots")
    .select("id, starts_at, ends_at, status, mode, template_item_id")
    .eq("trainer_id", userId)
    .in("status", ["open", "closed"])
    .gt("ends_at", now())
    .order("starts_at")
    .returns<SlotRow[]>();
  if (error) throw new Error(`loading slots failed: ${error.code}`);

  const intl = INTL_LOCALE[locale];
  const dayFormat = new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", timeZone: "UTC" });
  const longDay = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

  const markers = data.filter(isClosedMarker).map((slot) => {
    const from = dayFormat.format(asDate(localParts(slot.starts_at, timeZone).day));
    const to = dayFormat.format(asDate(localParts(new Date(Date.parse(slot.ends_at) - 1), timeZone).day));
    return { id: slot.id, label: from === to ? from : interpolate(copy.closedRange, { from, to }) };
  });

  const openSlots = data.filter((slot) => !isClosedMarker(slot) && slot.status === "open" && slot.starts_at > now());
  const queues = await loadOpenSlotQueues(owner, openSlots.map((slot) => slot.id));
  const time = new Intl.DateTimeFormat(intl, { hour: "2-digit", minute: "2-digit", timeZone });
  const slotTime = new Intl.DateTimeFormat(intl, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });

  const byDay = new Map<string, { id: string; label: string; open: boolean }[]>();
  for (const slot of data) {
    if (isClosedMarker(slot) || slot.starts_at >= until) continue;
    const start = localParts(slot.starts_at, timeZone);
    const end = localParts(slot.ends_at, timeZone);
    const label = `${formatMinutes(start.minutes)}–${formatMinutes(end.minutes)}`;
    byDay.set(start.day, [...(byDay.get(start.day) ?? []), { id: slot.id, label, open: slot.status === "open" }]);
  }

  return (
    <div className="flex flex-col gap-10">
      <CloseDaysForm today={today} timeZone={timeZone} />

      {queues.size > 0 ? (
        <section aria-labelledby="slot-queues" className="flex flex-col gap-4">
          <h2 id="slot-queues" className="px-1 text-title-3">
            {copy.queues}
          </h2>
          <p className="px-1 text-subhead text-ink-2">{copy.queuesText}</p>
          {openSlots
            .filter((slot) => queues.has(slot.id))
            .map((slot) => {
              const entries = queues.get(slot.id) ?? [];
              return (
                <WaitlistQueue
                  key={slot.id}
                  header={slotTime.format(new Date(slot.starts_at))}
                  entries={entries.map((entry) => ({
                    ...entry,
                    offeredUntil: entry.offerExpiresAt ? time.format(new Date(entry.offerExpiresAt)) : null,
                  }))}
                  canOffer={!entries.some((entry) => entry.status === "offered")}
                />
              );
            })}
        </section>
      ) : null}

      {markers.length > 0 ? (
        <ListGroup header={copy.closedHeader}>
          {markers.map((marker) => (
            <ListRow
              key={marker.id}
              title={marker.label}
              trailing={<ReopenButton slotId={marker.id} label={`${copy.reopen} ${marker.label}`} />}
            />
          ))}
        </ListGroup>
      ) : null}

      <section aria-labelledby="upcoming-slots" className="flex flex-col gap-4">
        <h2 id="upcoming-slots" className="px-1 text-title-3">
          {copy.upcoming}
        </h2>
        {byDay.size === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title={copy.noSlotsTitle}
            description={copy.noSlotsText}
            headingLevel={3}
            action={
              <Button asChild variant="secondary">
                <Link href="/trainer/schedule/template">{t.schedule.emptyWeekAction}</Link>
              </Button>
            }
          />
        ) : (
          [...byDay].map(([day, slots]) => (
            <ListGroup key={day} header={longDay.format(asDate(day))} headingLevel={3}>
              {slots.map((slot) => (
                <ListRow
                  key={slot.id}
                  title={<span className="tabular-nums">{slot.label}</span>}
                  trailing={
                    <div className="flex items-center gap-2">
                      {slot.open ? null : <Badge>{copy.slotClosed}</Badge>}
                      <SlotToggle slotId={slot.id} open={slot.open} label={`${longDay.format(asDate(day))}, ${slot.label}`} />
                    </div>
                  }
                />
              ))}
            </ListGroup>
          ))
        )}
      </section>
    </div>
  );
}

/**
 * "Слоты" (screens.md /trainer/schedule/slots, PRD 2.6.1): close days for a vacation, open them again,
 * and close or open single free slots of the next two weeks.
 */
export default async function ScheduleSlotsPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.schedule.slotsPage.title} back={{ fallbackHref: "/trainer/schedule" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Slots />
        </Suspense>
      </div>
    </Screen>
  );
}
