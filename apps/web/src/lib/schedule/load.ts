import "server-only";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { displayName } from "@/lib/pairs/clients";
import { readByIds } from "@/lib/supabase/paging";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ScheduleOwner = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  /** The trainer's zone from user_settings: the schedule's days and times are in it (PRD 2.6.7). */
  timeZone: string;
};

/** The signed-in user and their zone for the schedule screens, or null when nobody is signed in. */
export async function loadScheduleOwner(): Promise<ScheduleOwner | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle();
  return { supabase, userId, timeZone: settings?.time_zone ?? DEFAULT_TIME_ZONE };
}

/** Pair id → the client's name as the trainer sees it (their alias first). */
export async function clientNames(supabase: ScheduleOwner["supabase"], coachingIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(coachingIds)];
  if (ids.length === 0) return new Map();
  const [pairs, meta] = await Promise.all([
    readByIds(ids, (chunk) => supabase.from("coachings").select("id, client_id").in("id", chunk)),
    readByIds(ids, (chunk) => supabase.from("coaching_trainer_meta").select("coaching_id, client_alias").in("coaching_id", chunk)),
  ]);
  const people = await readByIds(
    (pairs.data ?? []).map((pair) => pair.client_id),
    (chunk) => supabase.from("profiles").select("id, first_name, last_name, display_name, username").in("id", chunk),
  );
  const person = new Map((people.data ?? []).map((row) => [row.id, row]));
  const alias = new Map((meta.data ?? []).map((row) => [row.coaching_id, row.client_alias]));
  return new Map((pairs.data ?? []).map((pair) => [pair.id, displayName(person.get(pair.client_id), alias.get(pair.id))]));
}

export type SessionFormData = {
  timeZone: string;
  /** Pairs a session can be assigned to: not ended. */
  clients: { coachingId: string; name: string }[];
  locations: { id: string; name: string }[];
  /** Online for a trainer who works only online, else in person: the form's default. */
  defaultMode: "offline" | "online";
};

/** What the session form offers the trainer. */
export async function loadSessionFormData(owner: ScheduleOwner): Promise<SessionFormData> {
  const { supabase, userId, timeZone } = owner;
  const [pairs, locations, profile] = await Promise.all([
    supabase.from("coachings").select("id").eq("trainer_id", userId).neq("status", "ended"),
    supabase.from("locations").select("id, name").eq("trainer_id", userId).is("archived_at", null).order("name"),
    supabase.from("trainer_profiles").select("works_offline").eq("user_id", userId).maybeSingle(),
  ]);
  if (pairs.error || locations.error) throw new Error(`loading the session form failed: ${(pairs.error ?? locations.error)?.code}`);
  const names = await clientNames(
    supabase,
    pairs.data.map((pair) => pair.id),
  );
  const clients = [...names].map(([coachingId, name]) => ({ coachingId, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { timeZone, clients, locations: locations.data, defaultMode: profile.data?.works_offline === false ? "online" : "offline" };
}

export type SessionDetail = {
  id: string;
  kind: "personal" | "group" | "trial";
  status: "scheduled" | "completed" | "cancelled";
  title: string | null;
  startsAt: string;
  endsAt: string;
  mode: "offline" | "online";
  location: { id: string; name: string; address: string | null } | null;
  meetingUrl: string | null;
  cancelReason: string | null;
  /** The repeat's weekdays, 1 = Monday, when the session is one of a weekly repeat. */
  repeat: { weekdays: number[]; ended: boolean } | null;
  /** Seats of a group session (1 for a personal one) and whether clients book it themselves. */
  capacity: number;
  openForBooking: boolean;
  clients: { bookingId: string; coachingId: string; name: string; status: string }[];
};

const RRULE_DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** One session of the signed-in trainer for /trainer/sessions/[id], or null when it is not theirs. */
export async function loadSession(owner: ScheduleOwner, sessionId: string): Promise<SessionDetail | null> {
  const { supabase, userId } = owner;
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, kind, status, title, starts_at, ends_at, mode, location_id, recurrence_id, cancel_reason, capacity, open_for_booking")
    .eq("id", sessionId)
    .eq("trainer_id", userId)
    .maybeSingle();
  if (error) throw new Error(`loading a session failed: ${error.code}`);
  if (!session) return null;

  const [bookings, location, link, recurrence] = await Promise.all([
    supabase.from("bookings").select("id, coaching_id, status").eq("session_id", session.id).order("created_at"),
    session.location_id
      ? supabase.from("locations").select("id, name, address").eq("id", session.location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.mode === "online" ? supabase.rpc("session_meeting_url", { p_session_id: session.id }) : Promise.resolve({ data: null }),
    session.recurrence_id
      ? supabase.from("recurrences").select("rrule, ended_at").eq("id", session.recurrence_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const names = await clientNames(
    supabase,
    (bookings.data ?? []).map((booking) => booking.coaching_id),
  );
  const byDay = /BYDAY=([A-Z,]+)/.exec(recurrence.data?.rrule ?? "")?.[1];

  return {
    id: session.id,
    kind: session.kind,
    status: session.status,
    title: session.title,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    mode: session.mode,
    location: location.data ?? null,
    meetingUrl: link.data ?? null,
    cancelReason: session.cancel_reason,
    repeat: recurrence.data
      ? {
          weekdays: (byDay ?? "")
            .split(",")
            .map((code) => RRULE_DAYS.indexOf(code) + 1)
            .filter((day) => day > 0),
          ended: Boolean(recurrence.data.ended_at),
        }
      : null,
    capacity: session.capacity,
    openForBooking: session.open_for_booking,
    clients: (bookings.data ?? []).map((booking) => ({
      bookingId: booking.id,
      coachingId: booking.coaching_id,
      name: names.get(booking.coaching_id) ?? "",
      status: booking.status,
    })),
  };
}

export type SessionWaitlistEntry = {
  id: string;
  coachingId: string;
  name: string;
  status: "waiting" | "offered";
  /** Place among those still waiting; null for an offered entry. */
  place: number | null;
  offerExpiresAt: string | null;
};

/** The live queue of a group session for its trainer (PRD wave-2 §9.6): offers first, then the waiting in order. */
export async function loadSessionWaitlist(owner: ScheduleOwner, sessionId: string): Promise<SessionWaitlistEntry[]> {
  const { supabase } = owner;
  const { data, error } = await supabase
    .from("waitlist_entries")
    .select("id, coaching_id, status, offer_expires_at, joined_at")
    .eq("session_id", sessionId)
    .in("status", ["waiting", "offered"])
    .order("joined_at")
    .order("id");
  if (error) throw new Error(`loading the waitlist failed: ${error.code}`);
  const names = await clientNames(
    supabase,
    data.map((row) => row.coaching_id),
  );
  let place = 0;
  const entries = data.map((row) => ({
    id: row.id,
    coachingId: row.coaching_id,
    name: names.get(row.coaching_id) ?? "",
    status: row.status as "waiting" | "offered",
    place: row.status === "waiting" ? ++place : null,
    offerExpiresAt: row.offer_expires_at,
  }));
  return [...entries.filter((entry) => entry.status === "offered"), ...entries.filter((entry) => entry.status === "waiting")];
}
