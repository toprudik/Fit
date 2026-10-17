"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { DEFAULT_TIME_ZONE } from "@/lib/plans/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientNames, type ScheduleOwner } from "./load";
import { localToUtc, parseDay, parseMinutes } from "./time";

/** RPC errors the session form explains in words; anything else is "failed". */
const KNOWN_ERRORS = [
  "in_past",
  "invalid_duration",
  "invalid_title",
  "invalid_repeat",
  "invalid_location",
  "invalid_link",
  "following_keeps_date",
  "not_your_client",
  "session_not_found",
  "not_editable",
  "invalid_capacity",
] as const;

export type SessionError = (typeof KNOWN_ERRORS)[number] | "failed";

export type SessionConflict = { id: string; startsAt: string; endsAt: string; name: string };

export type SaveSessionResult =
  | { status: "done"; sessionId: string; count: number }
  | { status: "conflict"; conflicts: SessionConflict[] }
  | { status: "error"; error: SessionError };

const day = z.string().refine((value) => parseDay(value) !== null);
const time = z.string().refine((value) => parseMinutes(value) !== null);

const fields = {
  day,
  time,
  durationMin: z.number().int().min(15).max(480),
  mode: z.enum(["offline", "online"]),
  locationId: z.uuid().nullable(),
  meetingUrl: z.string().trim().max(500).nullable(),
  title: z.string().trim().max(120).nullable(),
  /** Save even though the time overlaps another session (PRD 2.6.2-6: a warning, not a ban). */
  force: z.boolean(),
};

const createInput = z.object({
  ...fields,
  coachingId: z.uuid(),
  repeat: z
    .object({
      weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
      until: day.nullable(),
      count: z.number().int().min(2).max(200).nullable(),
    })
    .nullable(),
});

const createGroupInput = z.object({
  ...fields,
  title: z.string().trim().min(1).max(120),
  capacity: z.number().int().min(2).max(100),
  openForBooking: z.boolean(),
  repeat: createInput.shape.repeat,
});

const updateInput = z.object({ ...fields, sessionId: z.uuid(), following: z.boolean() });

export type CreateSessionInput = z.input<typeof createInput>;
export type CreateGroupSessionInput = z.input<typeof createGroupInput>;
export type UpdateSessionInput = z.input<typeof updateInput>;

function rpcError(error: { message: string; code: string }, what: string): SaveSessionResult {
  const known = KNOWN_ERRORS.find((key) => key === error.message);
  if (known) return { status: "error", error: known };
  console.error(`${what} failed`, error.code);
  return { status: "error", error: "failed" };
}

type Supabase = ScheduleOwner["supabase"];

/** The signed-in trainer's zone: the form's day and time are wall time there (PRD 2.6.7-1). */
async function trainerZone(supabase: Supabase): Promise<string | null> {
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle();
  return data?.time_zone ?? DEFAULT_TIME_ZONE;
}

/** Sessions of the trainer overlapping the time, each with the client's name or its own title. */
async function conflicts(supabase: Supabase, startsAt: Date, endsAt: Date, ignore: string | null): Promise<SessionConflict[]> {
  const { data, error } = await supabase.rpc("session_conflicts", {
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    ...(ignore ? { p_ignore: ignore } : {}),
  });
  if (error) {
    console.error("checking session conflicts failed", error.code);
    return [];
  }
  const names = await clientNames(
    supabase,
    data.map((row) => row.coaching_id).filter((id): id is string => Boolean(id)),
  );
  return data.map((row) => ({
    id: row.session_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    name: (row.coaching_id && names.get(row.coaching_id)) || row.title || "",
  }));
}

/**
 * "Назначить" on /trainer/sessions/new (PRD 2.6.2): one session or a weekly repeat for a client, confirmed at
 * once (Q20). An overlap with another session comes back first, and the trainer may save anyway.
 */
export async function createSession(raw: CreateSessionInput): Promise<SaveSessionResult> {
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "failed" };
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const zone = await trainerZone(supabase);
  if (!zone) return { status: "error", error: "failed" };
  const startsAt = localToUtc(input.day, parseMinutes(input.time)!, zone);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);

  if (!input.force) {
    const overlapping = await conflicts(supabase, startsAt, endsAt, null);
    if (overlapping.length > 0) return { status: "conflict", conflicts: overlapping };
  }

  const { data, error } = await supabase.rpc("create_session", {
    p_coaching_id: input.coachingId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: input.durationMin,
    p_mode: input.mode,
    ...(input.mode === "offline" && input.locationId ? { p_location_id: input.locationId } : {}),
    ...(input.mode === "online" && input.meetingUrl ? { p_meeting_url: input.meetingUrl } : {}),
    ...(input.title ? { p_title: input.title } : {}),
    ...(input.repeat
      ? {
          p_weekdays: input.repeat.weekdays,
          ...(input.repeat.until ? { p_until: input.repeat.until } : {}),
          ...(input.repeat.count ? { p_count: input.repeat.count } : {}),
        }
      : {}),
  });
  if (error) return rpcError(error, "creating a session");
  refresh();
  return { status: "done", sessionId: data[0].session_id, count: data[0].created };
}

/**
 * "Создать" for a group on /trainer/sessions/new (PRD 2.6.3): a titled session with seats, once or weekly. It
 * starts empty; with `openForBooking` the trainer's clients book seats themselves.
 */
export async function createGroupSession(raw: CreateGroupSessionInput): Promise<SaveSessionResult> {
  const parsed = createGroupInput.safeParse(raw);
  if (!parsed.success) return { status: "error", error: raw.title?.trim() ? "failed" : "invalid_title" };
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const zone = await trainerZone(supabase);
  if (!zone) return { status: "error", error: "failed" };
  const startsAt = localToUtc(input.day, parseMinutes(input.time)!, zone);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);

  if (!input.force) {
    const overlapping = await conflicts(supabase, startsAt, endsAt, null);
    if (overlapping.length > 0) return { status: "conflict", conflicts: overlapping };
  }

  const { data, error } = await supabase.rpc("create_group_session", {
    p_starts_at: startsAt.toISOString(),
    p_duration_min: input.durationMin,
    p_capacity: input.capacity,
    p_title: input.title,
    p_mode: input.mode,
    ...(input.mode === "offline" && input.locationId ? { p_location_id: input.locationId } : {}),
    ...(input.mode === "online" && input.meetingUrl ? { p_meeting_url: input.meetingUrl } : {}),
    p_open_for_booking: input.openForBooking,
    ...(input.repeat
      ? {
          p_weekdays: input.repeat.weekdays,
          ...(input.repeat.until ? { p_until: input.repeat.until } : {}),
          ...(input.repeat.count ? { p_count: input.repeat.count } : {}),
        }
      : {}),
  });
  if (error) return rpcError(error, "creating a group session");
  refresh();
  return { status: "done", sessionId: data[0].session_id, count: data[0].created };
}

/**
 * "Сохранить" on /trainer/sessions/[id]/edit (PRD 2.6.5-5): moves or changes one session, or with `following`
 * this one and the later ones of its repeat. The client gets one К6.
 */
export async function updateSession(raw: UpdateSessionInput): Promise<SaveSessionResult> {
  const parsed = updateInput.safeParse(raw);
  if (!parsed.success) return { status: "error", error: "failed" };
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const zone = await trainerZone(supabase);
  if (!zone) return { status: "error", error: "failed" };
  const startsAt = localToUtc(input.day, parseMinutes(input.time)!, zone);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);

  if (!input.force) {
    const overlapping = await conflicts(supabase, startsAt, endsAt, input.sessionId);
    if (overlapping.length > 0) return { status: "conflict", conflicts: overlapping };
  }

  const { data, error } = await supabase.rpc("update_session", {
    p_session_id: input.sessionId,
    p_starts_at: startsAt.toISOString(),
    p_duration_min: input.durationMin,
    p_mode: input.mode,
    ...(input.mode === "offline" && input.locationId ? { p_location_id: input.locationId } : {}),
    ...(input.mode === "online" && input.meetingUrl ? { p_meeting_url: input.meetingUrl } : {}),
    ...(input.title ? { p_title: input.title } : {}),
    p_following: input.following,
  });
  if (error) return rpcError(error, "updating a session");
  refresh();
  return { status: "done", sessionId: input.sessionId, count: data };
}

export type CancelSessionResult = { status: "done"; count: number } | { status: "error"; error: SessionError | "reason_required" };

/** "Отменить занятие" (PRD 2.6.5): with a reason the client sees, no charge; with `following` the rest of the repeat. */
export async function cancelSession(raw: { sessionId: string; reason: string; following: boolean }): Promise<CancelSessionResult> {
  const parsed = z.object({ sessionId: z.uuid(), reason: z.string().trim().max(500), following: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { status: "error", error: "failed" };
  if (!parsed.data.reason) return { status: "error", error: "reason_required" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_session", {
    p_session_id: parsed.data.sessionId,
    p_reason: parsed.data.reason,
    p_following: parsed.data.following,
  });
  if (error) {
    if (error.message === "reason_required") return { status: "error", error: "reason_required" };
    const result = rpcError(error, "cancelling a session");
    return { status: "error", error: result.status === "error" ? result.error : "failed" };
  }
  refresh();
  return { status: "done", count: data };
}

/** Errors of the participant and seat controls on a group session page. */
const GROUP_ERRORS = ["already_booked", "session_full", "not_your_client", "session_not_found", "capacity_below_occupied"] as const;

export type GroupError = (typeof GROUP_ERRORS)[number] | "failed";
export type GroupActionResult = { status: "done" } | { status: "error"; error: GroupError };

function groupError(error: { message: string; code: string }, what: string): GroupActionResult {
  const known = GROUP_ERRORS.find((key) => key === error.message);
  if (known) return { status: "error", error: known };
  console.error(`${what} failed`, error.code);
  return { status: "error", error: "failed" };
}

/** "Добавить участника" on a group session (PRD 2.6.3): the client is confirmed at once and gets К1. */
export async function addGroupParticipant(raw: { sessionId: string; coachingId: string }): Promise<GroupActionResult> {
  const parsed = z.object({ sessionId: z.uuid(), coachingId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("add_group_participant", {
    p_session_id: parsed.data.sessionId,
    p_coaching_id: parsed.data.coachingId,
  });
  if (error) return groupError(error, "adding a group participant");
  refresh();
  return { status: "done" };
}

/**
 * "Места" on a group session: the number of seats, never below the ones taken (capacity_below_occupied), and
 * whether clients book it themselves. RLS lets the trainer change these two columns of their own session.
 */
export async function updateGroupSeats(raw: { sessionId: string; capacity: number; openForBooking: boolean }): Promise<GroupActionResult> {
  const parsed = z.object({ sessionId: z.uuid(), capacity: z.number().int().min(2).max(100), openForBooking: z.boolean() }).safeParse(raw);
  if (!parsed.success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sessions")
    .update({ capacity: parsed.data.capacity, open_for_booking: parsed.data.openForBooking })
    .eq("id", parsed.data.sessionId)
    .eq("kind", "group")
    .eq("status", "scheduled")
    .select("id");
  if (error) return groupError(error, "changing group seats");
  if (data.length === 0) return { status: "error", error: "session_not_found" };
  refresh();
  return { status: "done" };
}

export type OfferSeatResult = { status: "done" } | { status: "error"; error: "session_full" | "waitlist_not_found" | "failed" };

/** "Предложить место" in a group's queue (PRD wave-2 §9.6): the trainer offers a free seat to someone out of turn. */
export async function offerWaitlistSeat(entryId: string): Promise<OfferSeatResult> {
  if (!z.uuid().safeParse(entryId).success) return { status: "error", error: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("trainer_offer_waitlist", { p_entry_id: entryId });
  if (error) {
    if (error.message === "session_full" || error.message === "waitlist_not_found") return { status: "error", error: error.message };
    console.error("offering a waitlist seat failed", error.code);
    return { status: "error", error: "failed" };
  }
  refresh();
  return { status: "done" };
}
