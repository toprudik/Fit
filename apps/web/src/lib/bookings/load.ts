import "server-only";
import { displayName } from "@/lib/pairs/clients";
import type { ScheduleOwner } from "@/lib/schedule/load";
import { clientNames } from "@/lib/schedule/load";
import type { Database } from "@/lib/supabase/database.types";

export type BookingStatus = Database["public"]["Enums"]["booking_status"];
type Supabase = ScheduleOwner["supabase"];

/** How far ahead the client books (screens.md /client/book: "на 2 недели"). */
export const BOOKING_DAYS = 14;

const PERSON_COLUMNS = "id, first_name, last_name, display_name, username";

function fail(what: string, error: { code: string }): never {
  throw new Error(`loading ${what} failed: ${error.code}`);
}

/** Trainer id → name and Telegram username, as the client sees them. */
async function trainerPeople(supabase: Supabase, ids: string[]): Promise<Map<string, { name: string; username: string | null }>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select(PERSON_COLUMNS).in("id", unique);
  if (error) fail("trainers", error);
  return new Map(data.map((row) => [row.id, { name: displayName(row), username: row.username }]));
}

export type BookingTrainer = { coachingId: string; trainerId: string; name: string; username: string | null };

/** The trainers of the client's live pairs, by name. */
export async function loadBookingTrainers(owner: ScheduleOwner): Promise<BookingTrainer[]> {
  const { supabase, userId } = owner;
  const { data, error } = await supabase
    .from("coachings")
    .select("id, trainer_id")
    .eq("client_id", userId)
    .in("status", ["trial", "active"]);
  if (error) fail("pairs", error);
  const people = await trainerPeople(
    supabase,
    data.map((pair) => pair.trainer_id),
  );
  return data
    .map((pair) => ({
      coachingId: pair.id,
      trainerId: pair.trainer_id,
      name: people.get(pair.trainer_id)?.name ?? "",
      username: people.get(pair.trainer_id)?.username ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type BookableSlot = { id: string; startsAt: string; endsAt: string; mode: "offline" | "online"; place: string | null };

/** An open group session of the trainer (PRD 2.6.4-1): seats taken, and the client's own booking on it. */
export type BookableGroup = BookableSlot & {
  title: string;
  capacity: number;
  /** Seats held by bookings and open waitlist offers. */
  taken: number;
  myBookingId: string | null;
  /** The caller's place in the queue of a full group (PRD wave-2 §9): waiting with a place, or offered a seat. */
  waitlist: { id: string; status: "waiting" | "offered"; place: number | null } | null;
};

/** A live booking of the client: the overlap warning names its trainer (PRD 2.6.4-8). */
export type BusyTime = { startsAt: string; endsAt: string; trainer: string };

export type BookingPage = {
  trainer: BookingTrainer;
  slots: BookableSlot[];
  groups: BookableGroup[];
  busy: BusyTime[];
  dropIn: { priceMinor: number; currency: string } | null;
  paymentLinks: { title: string; url: string }[];
};

/** What /client/book shows for one trainer: free slots for two weeks past the booking notice, and prices. */
export async function loadBookingPage(owner: ScheduleOwner, trainer: BookingTrainer, now: Date): Promise<BookingPage> {
  const { supabase } = owner;
  const { data: profile, error: profileError } = await supabase
    .from("trainer_profiles")
    .select("min_booking_notice_minutes")
    .eq("user_id", trainer.trainerId)
    .maybeSingle();
  if (profileError) fail("trainer profile", profileError);
  const from = new Date(now.getTime() + (profile?.min_booking_notice_minutes ?? 0) * 60_000);
  const until = new Date(now.getTime() + BOOKING_DAYS * 86_400_000);

  const [slots, groups, dropIn, links, busy] = await Promise.all([
    supabase
      .from("slots")
      .select("id, starts_at, ends_at, mode, location_id")
      .eq("trainer_id", trainer.trainerId)
      .eq("status", "open")
      .gte("starts_at", from.toISOString())
      .lt("starts_at", until.toISOString())
      .order("starts_at"),
    supabase.rpc("bookable_group_sessions", {
      p_trainer_id: trainer.trainerId,
      p_from: now.toISOString(),
      p_until: until.toISOString(),
    }),
    supabase
      .from("packages")
      .select("price_minor, currency, applies_to")
      .eq("trainer_id", trainer.trainerId)
      .eq("sessions_count", 1)
      .in("applies_to", ["any", "personal"])
      .is("archived_at", null)
      .order("applies_to", { ascending: false })
      .limit(1),
    supabase.from("payment_links").select("title, url").eq("trainer_id", trainer.trainerId).is("archived_at", null).order("sort_order"),
    loadBusy(owner, now),
  ]);
  if (slots.error) fail("slots", slots.error);
  if (groups.error) fail("group sessions", groups.error);
  const locationIds = [
    ...new Set([...slots.data, ...groups.data].map((item) => item.location_id).filter((id): id is string => Boolean(id))),
  ];
  const locations = locationIds.length ? await supabase.from("locations").select("id, name").in("id", locationIds) : { data: [] };
  const placeName = new Map((locations.data ?? []).map((location) => [location.id, location.name]));

  return {
    trainer,
    slots: slots.data.map((slot) => ({
      id: slot.id,
      startsAt: slot.starts_at,
      endsAt: slot.ends_at,
      mode: slot.mode,
      place: slot.location_id ? (placeName.get(slot.location_id) ?? null) : null,
    })),
    groups: groups.data.map((row) => ({
      id: row.session_id,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      mode: row.mode,
      place: row.location_id ? (placeName.get(row.location_id) ?? null) : null,
      title: row.title,
      capacity: row.capacity,
      taken: row.taken,
      myBookingId: row.my_booking_id,
      waitlist:
        row.my_waitlist_id && (row.my_waitlist_status === "waiting" || row.my_waitlist_status === "offered")
          ? { id: row.my_waitlist_id, status: row.my_waitlist_status, place: row.my_waitlist_place }
          : null,
    })),
    busy,
    dropIn: dropIn.data?.[0] ? { priceMinor: dropIn.data[0].price_minor, currency: dropIn.data[0].currency } : null,
    paymentLinks: links.data ?? [],
  };
}

/** The client's requested and confirmed future bookings, with every trainer. */
async function loadBusy(owner: ScheduleOwner, now: Date): Promise<BusyTime[]> {
  const bookings = await loadClientBookings(owner);
  return bookings
    .filter((booking) => (booking.status === "requested" || booking.status === "confirmed") && booking.endsAt > now.toISOString())
    .map((booking) => ({ startsAt: booking.startsAt, endsAt: booking.endsAt, trainer: booking.trainer }));
}

export type ClientBooking = {
  id: string;
  status: BookingStatus;
  sessionStatus: "scheduled" | "completed" | "cancelled";
  startsAt: string;
  endsAt: string;
  mode: "offline" | "online";
  title: string | null;
  trainer: string;
  trainerUsername: string | null;
  trainerId: string;
  sessionId: string;
  locationId: string | null;
  cancelReason: string | null;
};

/** Every booking of the signed-in client with every trainer (PRD 2.6.4-7), newest sessions first. */
export async function loadClientBookings(owner: ScheduleOwner, bookingId?: string): Promise<ClientBooking[]> {
  const { supabase, userId } = owner;
  let query = supabase
    .from("bookings")
    .select("id, status, session_id, trainer_id, cancel_reason")
    .eq("client_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (bookingId) query = query.eq("id", bookingId);
  const { data: bookings, error } = await query;
  if (error) fail("bookings", error);
  if (bookings.length === 0) return [];

  const [sessions, people] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, status, starts_at, ends_at, mode, title, location_id, cancel_reason")
      .in("id", [...new Set(bookings.map((booking) => booking.session_id))]),
    trainerPeople(
      supabase,
      bookings.map((booking) => booking.trainer_id),
    ),
  ]);
  if (sessions.error) fail("sessions", sessions.error);
  const byId = new Map(sessions.data.map((session) => [session.id, session]));

  return bookings
    .flatMap((booking) => {
      const session = byId.get(booking.session_id);
      if (!session) return [];
      return [
        {
          id: booking.id,
          status: booking.status,
          sessionStatus: session.status,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          mode: session.mode,
          title: session.title,
          trainer: people.get(booking.trainer_id)?.name ?? "",
          trainerUsername: people.get(booking.trainer_id)?.username ?? null,
          trainerId: booking.trainer_id,
          sessionId: session.id,
          locationId: session.location_id,
          cancelReason: booking.cancel_reason ?? session.cancel_reason,
        },
      ];
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export type ClientBookingDetail = ClientBooking & {
  location: { name: string; address: string | null } | null;
  meetingUrl: string | null;
  /** When a free cancellation ends: the session start minus the trainer's deadline (PRD 2.6.5-2). */
  freeCancelUntil: string | null;
};

/** One booking of the signed-in client for /client/bookings/[id], or null when it is not theirs. */
export async function loadClientBooking(owner: ScheduleOwner, bookingId: string): Promise<ClientBookingDetail | null> {
  const [booking] = await loadClientBookings(owner, bookingId);
  if (!booking) return null;
  const { supabase } = owner;
  const [location, link, profile] = await Promise.all([
    booking.locationId
      ? supabase.from("locations").select("name, address").eq("id", booking.locationId).maybeSingle()
      : Promise.resolve({ data: null }),
    booking.mode === "online" && booking.status === "confirmed"
      ? supabase.rpc("session_meeting_url", { p_session_id: booking.sessionId })
      : Promise.resolve({ data: null }),
    supabase.from("trainer_profiles").select("cancellation_deadline_hours").eq("user_id", booking.trainerId).maybeSingle(),
  ]);
  const hours = profile.data?.cancellation_deadline_hours;
  return {
    ...booking,
    location: location.data ?? null,
    meetingUrl: link.data ?? null,
    freeCancelUntil:
      booking.status === "confirmed" && typeof hours === "number"
        ? new Date(new Date(booking.startsAt).getTime() - hours * 3_600_000).toISOString()
        : null,
  };
}

export type TrainerRequest = {
  id: string;
  coachingId: string;
  client: string;
  sessionId: string;
  startsAt: string;
  endsAt: string;
  mode: "offline" | "online";
  locationId: string | null;
  /** A trial request names its trial link (PRD 2.3-5). */
  trialLinkId: string | null;
};

/** Open booking requests of the signed-in trainer, soonest first; one of them with `bookingId`. */
export async function loadTrainerRequests(owner: ScheduleOwner, now: Date, bookingId?: string): Promise<TrainerRequest[]> {
  const { supabase, userId } = owner;
  let query = supabase.from("bookings").select("id, coaching_id, session_id").eq("trainer_id", userId).eq("status", "requested");
  if (bookingId) query = query.eq("id", bookingId);
  const { data: bookings, error } = await query;
  if (error) fail("requests", error);
  if (bookings.length === 0) return [];

  const [sessions, names] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, starts_at, ends_at, mode, location_id, trial_link_id")
      .in(
        "id",
        bookings.map((booking) => booking.session_id),
      )
      .gt("starts_at", now.toISOString()),
    clientNames(
      supabase,
      bookings.map((booking) => booking.coaching_id),
    ),
  ]);
  if (sessions.error) fail("request sessions", sessions.error);
  const byId = new Map(sessions.data.map((session) => [session.id, session]));
  return bookings
    .flatMap((booking) => {
      const session = byId.get(booking.session_id);
      if (!session) return [];
      return [
        {
          id: booking.id,
          coachingId: booking.coaching_id,
          client: names.get(booking.coaching_id) ?? "",
          sessionId: session.id,
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          mode: session.mode,
          locationId: session.location_id,
          trialLinkId: session.trial_link_id,
        },
      ];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export type TrainerRequestDetail = TrainerRequest & {
  place: string | null;
  availableSessions: number;
  debtSessions: number;
  /** The trial's terms when this is a trial request. */
  trial: { title: string; priceMinor: number; currency: string } | null;
};

/** One open request of the signed-in trainer with the client's balance (screens.md /trainer/requests/[id]). */
export async function loadTrainerRequest(owner: ScheduleOwner, bookingId: string, now: Date): Promise<TrainerRequestDetail | null> {
  const [request] = await loadTrainerRequests(owner, now, bookingId);
  if (!request) return null;
  const { supabase } = owner;
  const [location, balance, trial] = await Promise.all([
    request.locationId
      ? supabase.from("locations").select("name").eq("id", request.locationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("coaching_balances").select("available_sessions, debt_sessions").eq("coaching_id", request.coachingId).maybeSingle(),
    request.trialLinkId
      ? supabase.from("trial_links").select("title, price_minor, currency").eq("id", request.trialLinkId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    ...request,
    place: location.data?.name ?? null,
    availableSessions: balance.data?.available_sessions ?? 0,
    debtSessions: balance.data?.debt_sessions ?? 0,
    trial: trial.data ? { title: trial.data.title, priceMinor: trial.data.price_minor, currency: trial.data.currency } : null,
  };
}

/** How many open requests the trainer has, for the button on the schedule. */
export async function countTrainerRequests(owner: ScheduleOwner, now: Date): Promise<number> {
  return (await loadTrainerRequests(owner, now)).length;
}

export type WaitlistStatus = Database["public"]["Enums"]["waitlist_status"];

export type WaitlistEntryView = {
  id: string;
  status: WaitlistStatus;
  place: number | null;
  offerExpiresAt: string | null;
  bookingId: string | null;
  session: { id: string; title: string; startsAt: string; endsAt: string; mode: "offline" | "online"; place: string | null };
  trainer: string;
  /** For an offer: whether a pass or allowed debt confirms the booking, and the pass it would use. */
  confirmed: boolean | null;
  passTitle: string | null;
  sessionsLeft: number | null;
  /** A cancel would already be charged: the offer comes inside the cancellation deadline (PRD wave-2 §9 rule 6). */
  insideDeadline: boolean;
};

/** One of the client's waitlist entries for /client/waitlist/[entryId], or null when it is not theirs. */
export async function loadWaitlistEntry(owner: ScheduleOwner, entryId: string): Promise<WaitlistEntryView | null> {
  const { supabase } = owner;
  const { data, error } = await supabase.rpc("waitlist_entry_view", { p_entry_id: entryId });
  if (error) fail("waitlist entry", error);
  const row = data[0];
  if (!row) return null;
  const people = await trainerPeople(supabase, [row.trainer_id]);
  return {
    id: row.entry_id,
    status: row.status,
    place: row.place,
    offerExpiresAt: row.offer_expires_at,
    bookingId: row.booking_id,
    session: {
      id: row.session_id,
      title: row.title ?? "",
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      mode: row.mode,
      place: row.location,
    },
    trainer: people.get(row.trainer_id)?.name ?? "",
    confirmed: row.confirmed,
    passTitle: row.pass_title,
    sessionsLeft: row.sessions_left,
    insideDeadline: Boolean(row.inside_deadline),
  };
}
