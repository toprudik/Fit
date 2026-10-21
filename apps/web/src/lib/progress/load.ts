import "server-only";
import { z } from "zod";
import { todayIn } from "@/lib/passes/present";
import type { Milestone } from "@/lib/pairs/milestones";
import { loadTrainerShares } from "@/lib/sharing/load";
import { readAllPages, readByIds } from "@/lib/supabase/paging";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MeasurementKind } from "./measurements";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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
  // Every entry, page by page: "Всё" on the chart reaches the first one (PostgREST returns 1000 rows at most).
  const { data, error } = await readAllPages((from, to) =>
    supabase
      .from("measurements")
      .select("id, kind, value, measured_at, local_date, entered_by")
      .eq("client_id", clientId)
      .order("measured_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (error) throw new Error(`loading measurements failed: ${error.code}`);
  const others = [...new Set(data.map((row) => row.entered_by).filter((id): id is string => !!id && id !== me && id !== clientId))];
  const people = new Map<string, Person>();
  if (others.length) {
    // A trainer of an ended pair may be hidden from the client; the entry then reads "Тренер" without a name.
    const { data: rows } = await readByIds(others, (chunk) =>
      supabase.from("profiles").select("id, first_name, last_name, display_name").in("id", chunk),
    );
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

export type PairMilestones = {
  coachingId: string;
  /** The other side of the pair, for the client's list of trainers. */
  partnerName: string;
  /** Attended sessions only: no-shows and late cancellations do not count (PROG-8). */
  attended: number;
  /** Reached milestones, oldest first; recorded by the bookings trigger and never taken back. */
  milestones: Milestone[];
  timeZone: string;
};

/** Milestones of the signed-in client's live pairs, one per trainer, oldest pair first. */
export async function loadMyMilestones(): Promise<PairMilestones[]> {
  const supabase = await createSupabaseServerClient();
  const me = await viewer(supabase);
  if (!me) return [];
  const { data: pairs, error } = await supabase
    .from("coachings")
    .select("id, trainer_id")
    .eq("client_id", me.id)
    .neq("status", "ended")
    .order("started_at");
  if (error) throw new Error(`loading pairs failed: ${error.code}`);
  if (!pairs.length) return [];
  const ids = pairs.map((pair) => pair.id);
  const [stats, milestones, people] = await Promise.all([
    supabase.from("coaching_stats").select("coaching_id, attended_count").in("coaching_id", ids),
    supabase.from("milestones").select("id, coaching_id, kind, achieved_at").in("coaching_id", ids).order("achieved_at"),
    supabase
      .from("profiles")
      .select("id, first_name, last_name, display_name")
      .in(
        "id",
        pairs.map((pair) => pair.trainer_id),
      ),
  ]);
  if (stats.error) throw new Error(`loading attended sessions failed: ${stats.error.code}`);
  if (milestones.error) throw new Error(`loading milestones failed: ${milestones.error.code}`);
  const byId = new Map((people.data ?? []).map((person) => [person.id, person]));
  const attended = new Map(stats.data.map((row) => [row.coaching_id, row.attended_count ?? 0]));
  return pairs.map((pair) => ({
    coachingId: pair.id,
    partnerName: nameOf(byId.get(pair.trainer_id)),
    attended: attended.get(pair.id) ?? 0,
    milestones: milestones.data
      .filter((row) => row.coaching_id === pair.id)
      .map((row) => ({ id: row.id, kind: row.kind, achievedAt: row.achieved_at })),
    timeZone: me.timeZone,
  }));
}
