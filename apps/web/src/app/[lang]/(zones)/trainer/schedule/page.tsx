import type { Metadata } from "next";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DayList, WeekGrid, type DayLabel } from "@/components/schedule/week-view";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { addDays, localToUtc, parseDay, today as todayIn, weekDays, weekStart } from "@/lib/schedule/time";
import { buildWeek, type SessionRow, type SlotRow } from "@/lib/schedule/week";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.tabs.trainer.schedule };
}

/** Seats a group session has taken: everyone booked in, whether they came yet or not. */
const TAKEN = ["confirmed", "attended", "no_show"] as const;

async function Week({ searchParams }: { searchParams: PageProps<"/[lang]/trainer/schedule">["searchParams"] }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.schedule;
  const owner = await loadScheduleOwner();
  if (!owner) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t.tabs.trainer.schedule}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/schedule")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }

  const { supabase, userId, timeZone } = owner;
  const today = todayIn(timeZone);
  const selected = parseDay(params.date) ?? today;
  const monday = weekStart(selected);
  const days = weekDays(monday);
  const from = localToUtc(monday, 0, timeZone).toISOString();
  const to = localToUtc(addDays(monday, 7), 0, timeZone).toISOString();

  const [slots, sessions, template] = await Promise.all([
    supabase
      .from("slots")
      .select("id, starts_at, ends_at, status, mode, template_item_id")
      .eq("trainer_id", userId)
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at")
      .returns<SlotRow[]>(),
    supabase
      .from("sessions")
      .select("id, kind, title, starts_at, ends_at, mode, capacity, status")
      .eq("trainer_id", userId)
      .neq("status", "cancelled")
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at")
      .returns<SessionRow[]>(),
    supabase.from("week_templates").select("id").eq("trainer_id", userId).eq("is_active", true).maybeSingle(),
  ]);
  if (slots.error || sessions.error) {
    console.error("loading the schedule failed", slots.error?.code ?? sessions.error?.code);
    throw new Error("loading the schedule failed");
  }

  const groups = sessions.data.filter((session) => session.kind === "group").map((session) => session.id);
  const taken = new Map<string, number>();
  if (groups.length > 0) {
    const { data } = await supabase.from("bookings").select("session_id").in("session_id", groups).in("status", TAKEN);
    for (const booking of data ?? []) taken.set(booking.session_id, (taken.get(booking.session_id) ?? 0) + 1);
  }
  const week = buildWeek(days, slots.data, sessions.data, taken, timeZone);

  // Days are UTC midnights, so formatting in UTC never shifts them.
  const intl = INTL_LOCALE[locale];
  const weekday = new Intl.DateTimeFormat(intl, { weekday: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const labels = new Map<string, DayLabel>(
    days.map((day) => {
      const date = new Date(`${day}T00:00:00Z`);
      return [day, { day, weekday: weekday.format(date), date: String(date.getUTCDate()), long: long.format(date) }];
    }),
  );
  const range = new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .formatRange(new Date(`${monday}T00:00:00Z`), new Date(`${addDays(monday, 6)}T00:00:00Z`))
    .replace(/\s?г\.$/, "");

  const empty = week.every((day) => day.items.length === 0 && !day.closed);
  const link = (day: string) => `/trainer/schedule?date=${day}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <p className="me-auto text-headline tabular-nums" aria-live="polite">
          <span className="sr-only">{copy.weekLabel} </span>
          {range}
        </p>
        <IconButton asChild icon={ChevronLeft} label={copy.previousWeek}>
          <Link href={link(addDays(selected, -7))} />
        </IconButton>
        <IconButton asChild icon={ChevronRight} label={copy.nextWeek}>
          <Link href={link(addDays(selected, 7))} />
        </IconButton>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/trainer/schedule" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {copy.today}
        </Link>
        <Link href="/trainer/schedule/template" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {copy.template}
        </Link>
        <Link href="/trainer/schedule/slots" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {copy.slots}
        </Link>
      </div>
      {empty && !template.data ? (
        <EmptyState
          icon={CalendarDays}
          title={copy.emptyWeekTitle}
          description={copy.emptyWeekText}
          action={
            <Button asChild>
              <Link href="/trainer/schedule/template">{copy.emptyWeekAction}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <DayList week={week} labels={labels} selected={selected} today={today} copy={copy} />
          <WeekGrid week={week} labels={labels} today={today} copy={copy} />
        </>
      )}
    </div>
  );
}

/**
 * The trainer's calendar (screens.md §2.2 "Расписание", PRD 2.6): free slots and sessions of a week,
 * a day at a time on a phone and a time grid on a desktop. ?date= picks the day and so the week.
 */
export default async function TrainerSchedulePage(props: PageProps<"/[lang]/trainer/schedule">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.tabs.trainer.schedule} />}>
      <div className="flex w-full flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <Week searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
