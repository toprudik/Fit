import "server-only";
import { z } from "zod";
import { todayIn } from "@/lib/passes/present";
import { loadTrainerShares } from "@/lib/sharing/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { MeasurementKind } from "./measurements";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type MilestoneKind = Database["public"]["Enums"]["milestone_kind"];

/** Who entered a value, from the viewer's side: the viewer, the client, or a trainer (named when known). */
export type Author = { kind: "me" } | { kind: "client" } | { kind: "trainer"; name: string };

export type MeasurementEntry = {
  id: string;
  kind: MeasurementKind;
  /** kg or cm, as stored. */
  value: number;
  /** Local date of the measurement, YYYY-MM-DD. */
  date: string;
  /** measured_at, to order entries of one day. */
  at: string;
  author: Author;
  /** Only the author edits or deletes an entry (R41b, PROG-1). */
  mine: boolean;
};

export type Measurements = { entries: MeasurementEntry[]; today: string };

const ENTRY_LIMIT = 2000;

type Person = { id: string; first_name: string | null; last_name: string | null; display_name: string | null };

function nameOf(person: Person | undefined): string {
  if (!person) return "";
  return person.display_name?.trim() || [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
}

async function viewer(supabase: Supabase): Promise<{ id: string; timeZone: string } | null> {
  const { data: session } = await supabase.auth.getClaims();
  const id = session?.claims.sub;
  if (!id) return null;
  const { data } = await supabase.from("user_settings").select("time_zone").eq("user_id", id).maybeSingle();
  return { id, timeZone: data?.time_zone ?? "Europe/Moscow" };
}

/** Every measurement of a client the viewer may read (RLS decides), newest first, with its author. */
async function measurementsOf(supabase: Supabase, clientId: string, me: string): Promise<MeasurementEntry[]> {
  const { data, error } = await supabase
    .from("measurements")
    .select("id, kind, value, measured_at, local_date, entered_by")
    .eq("client_id", clientId)
    .order("measured_at", { ascending: false })
    .limit(ENTRY_LIMIT);
  if (error) throw new Error(`loading measurements failed: ${error.code}`);
  const others = [...new Set(data.map((row) => row.entered_by).filter((id): id is string => !!id && id !== me && id !== clientId))];
  const people = new Map<string, Person>();
  if (others.length) {
    // A trainer of an ended pair may be hidden from the client; the entry then reads "Тренер" without a name.
    const { data: rows } = await supabase.from("profiles").select("id, first_name, last_name, display_name").in("id", others);
    for (const row of rows ?? []) people.set(row.id, row);
  }
  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    value: Number(row.value),
    date: row.local_date,
    at: row.measured_at,
    author:
      row.entered_by === me
        ? { kind: "me" }
        : row.entered_by === clientId
          ? { kind: "client" }
          : { kind: "trainer", name: nameOf(row.entered_by ? people.get(row.entered_by) : undefined) },
    mine: row.entered_by === me,
  }));
}

/** The signed-in client's own measurements, entered by them or by any of their trainers. Null when signed out. */
export async function loadMyMeasurements(): Promise<Measurements | null> {
  const supabase = await createSupabaseServerClient();
  const me = await viewer(supabase);
  if (!me) return null;
  return { entries: await measurementsOf(supabase, me.id, me.id), today: todayIn(me.timeZone) };
}

export type PairMeasurements =
  | { state: "open"; clientId: string; live: boolean; measurements: Measurements }
  /** The client keeps measurements to themselves, or the pair has ended (PRD 2.11 edge cases). */
  | { state: "closed" };

/**
 * The client's measurements on the trainer's card. Null when the caller is not this pair's trainer. A trainer
 * reads and adds them only while the pair is live and shares measurements; RLS enforces it, this picks the words.
 */
export async function loadPairMeasurements(coachingId: string): Promise<PairMeasurements | null> {
  if (!z.uuid().safeParse(coachingId).success) return null;
  const supabase = await createSupabaseServerClient();
  const [me, shares] = await Promise.all([viewer(supabase), loadTrainerShares(coachingId)]);
  if (!me || !shares) return null;
  if (!shares.measurements) return { state: "closed" };
  const { data: pair, error } = await supabase.from("coachings").select("client_id, status").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair) return null;
  return {
    state: "open",
    clientId: pair.client_id,
    live: pair.status !== "ended",
    measurements: { entries: await measurementsOf(supabase, pair.client_id, me.id), today: todayIn(me.timeZone) },
  };
}

export const MILESTONE_SESSIONS: Record<MilestoneKind, number> = { sessions_10: 10, sessions_25: 25, sessions_50: 50, sessions_100: 100 };

export type PairMilestones = {
  coachingId: string;
  /** The other side of the pair, for the client's list of trainers. */
  partnerName: string;
  startedAt: string;
  /** Attended sessions only: no-shows and late cancellations do not count (PROG-8). */
  attended: number;
  /** Reached thresholds, smallest first; recorded by the bookings trigger and never taken back. */
  reached: number[];
  timeZone: string;
};

async function milestonesOf(supabase: Supabase, coachingIds: string[]) {
  const [milestones, ...counts] = await Promise.all([
    supabase.from("milestones").select("coaching_id, kind").in("coaching_id", coachingIds),
    ...coachingIds.map((id) =>
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("coaching_id", id).eq("status", "attended"),
    ),
  ]);
  if (milestones.error) throw new Error(`loading milestones failed: ${milestones.error.code}`);
  const reached = new Map<string, number[]>();
  for (const row of milestones.data) reached.set(row.coaching_id, [...(reached.get(row.coaching_id) ?? []), MILESTONE_SESSIONS[row.kind]]);
  return coachingIds.map((id, index) => {
    const count = counts[index];
    if (count.error) throw new Error(`counting attended sessions failed: ${count.error.code}`);
    return { coachingId: id, attended: count.count ?? 0, reached: (reached.get(id) ?? []).sort((a, b) => a - b) };
  });
}

/** Milestones of one pair for the trainer's card. Null when the caller is not this pair's trainer. */
export async function loadTrainerMilestones(coachingId: string): Promise<PairMilestones | null> {
  if (!z.uuid().safeParse(coachingId).success) return null;
  const supabase = await createSupabaseServerClient();
  const me = await viewer(supabase);
  if (!me) return null;
  const { data: pair, error } = await supabase.from("coachings").select("id, trainer_id, started_at").eq("id", coachingId).maybeSingle();
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair || pair.trainer_id !== me.id) return null;
  const [counted] = await milestonesOf(supabase, [pair.id]);
  return { ...counted, partnerName: "", startedAt: pair.started_at, timeZone: me.timeZone };
}

/** Milestones of the signed-in client's live pairs, one per trainer, oldest pair first. */
export async function loadMyMilestones(): Promise<PairMilestones[]> {
  const supabase = await createSupabaseServerClient();
  const me = await viewer(supabase);
  if (!me) return [];
  const { data: pairs, error } = await supabase
    .from("coachings")
    .select("id, trainer_id, started_at")
    .eq("client_id", me.id)
    .neq("status", "ended")
    .order("started_at");
  if (error) throw new Error(`loading pairs failed: ${error.code}`);
  if (!pairs.length) return [];
  const [counted, people] = await Promise.all([
    milestonesOf(
      supabase,
      pairs.map((pair) => pair.id),
    ),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, display_name")
      .in(
        "id",
        pairs.map((pair) => pair.trainer_id),
      ),
  ]);
  const byId = new Map((people.data ?? []).map((person) => [person.id, person]));
  return pairs.map((pair, index) => ({
    ...counted[index],
    partnerName: nameOf(byId.get(pair.trainer_id)),
    startedAt: pair.started_at,
    timeZone: me.timeZone,
  }));
}
