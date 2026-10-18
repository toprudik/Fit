import "server-only";
import { countTrainerRequests } from "@/lib/bookings/load";
import { clientNames, type ScheduleOwner } from "@/lib/schedule/load";
import { addDays, localToUtc, today as todayIn } from "@/lib/schedule/time";
import { buildWeek, type DayItem, type SessionRow } from "@/lib/schedule/week";

/** Seats a group session has taken: everyone booked in, whether they came yet or not. */
const TAKEN = ["confirmed", "attended", "no_show"] as const;

export type TodaySession = Extract<DayItem, { type: "session" }>;

export type TrainerToday = {
  /** The trainer's local day, YYYY-MM-DD. */
  day: string;
  /** Today's sessions in the trainer's zone, earliest first; cancelled ones left out. */
  sessions: TodaySession[];
  /** Session id → the client's name, for personal sessions and trials. */
  names: Map<string, string>;
  /** Open booking requests waiting for the trainer's answer. */
  requests: number;
};

/** The timeline and the requests of the trainer's "Сегодня" (screens.md §2.1). */
export async function loadTrainerToday(owner: ScheduleOwner, now: Date): Promise<TrainerToday> {
  const { supabase, userId, timeZone } = owner;
  const day = todayIn(timeZone);
  const from = localToUtc(day, 0, timeZone).toISOString();
  const to = localToUtc(addDays(day, 1), 0, timeZone).toISOString();

  const [sessions, requests] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, kind, title, starts_at, ends_at, mode, capacity, status")
      .eq("trainer_id", userId)
      .neq("status", "cancelled")
      .lt("starts_at", to)
      .gt("ends_at", from)
      .order("starts_at")
      .returns<SessionRow[]>(),
    countTrainerRequests(owner, now),
  ]);
  if (sessions.error) {
    console.error("loading today's sessions failed", sessions.error.code);
    throw new Error("loading today's sessions failed");
  }

  // Group seats taken, and the client of each personal session or trial for its row.
  const taken = new Map<string, number>();
  const pairOf = new Map<string, string>();
  if (sessions.data.length > 0) {
    const { data, error } = await supabase
      .from("bookings")
      .select("session_id, coaching_id")
      .in(
        "session_id",
        sessions.data.map((session) => session.id),
      )
      .in("status", ["requested", ...TAKEN]);
    if (error) {
      console.error("loading today's bookings failed", error.code);
      throw new Error("loading today's bookings failed");
    }
    const kind = new Map(sessions.data.map((session) => [session.id, session.kind]));
    for (const booking of data) {
      if (kind.get(booking.session_id) === "group") taken.set(booking.session_id, (taken.get(booking.session_id) ?? 0) + 1);
      else pairOf.set(booking.session_id, booking.coaching_id);
    }
  }
  const pairNames = await clientNames(supabase, [...pairOf.values()]);
  const names = new Map<string, string>();
  for (const [sessionId, coachingId] of pairOf) {
    const name = pairNames.get(coachingId);
    if (name) names.set(sessionId, name);
  }

  // A session that started yesterday and runs past midnight belongs to yesterday, as in the week view.
  const [today] = buildWeek([day], [], sessions.data, taken, timeZone);
  const items = today.items.filter((item): item is TodaySession => item.type === "session");
  return { day, sessions: items, names, requests };
}
