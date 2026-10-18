import "server-only";
import { z } from "zod";
import type { Homework, HomeworkOccurrence } from "@/lib/homework/homework";
import { displayName } from "@/lib/pairs/clients";
import { todayIn } from "@/lib/passes/present";
import type { MeasurementEntry, Measurements } from "@/lib/progress/load";
import { loadScheduleOwner, type ScheduleOwner } from "@/lib/schedule/load";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The assistant's side of a delegation (PRD wave-3 §1, rules 3 and 10): the owners who handed the caller their
 * clients and what the caller may do for each pair. Every read goes through RLS, which lets a delegate see a
 * pair and its data only while the delegation covers it, so these loaders never filter by the caller's id.
 */
export type Scope = Database["public"]["Enums"]["delegation_scope"];

/** The scopes that open a section of the assistant's client card; money is never delegated (rule 3). */
export const CARD_SCOPES = ["progress", "homework", "notes"] as const satisfies readonly Scope[];
export type CardScope = (typeof CARD_SCOPES)[number];

export type AssistedClient = { coachingId: string; name: string };

export type AssistedOwner = {
  delegationId: string;
  ownerId: string;
  ownerName: string;
  scopes: Scope[];
  allClients: boolean;
  endsAt: string | null;
  clients: AssistedClient[];
};

const LIVE = ["trial", "active"] as const;

function fail(what: string, error: { code?: string }): never {
  throw new Error(`loading the ${what} failed: ${error.code}`);
}

type Assistance = { id: string; owner_trainer_id: string; scopes: Scope[]; all_clients: boolean; ends_at: string | null };

/** The caller's live assistant delegations: accepted, started and not yet over. */
async function liveAssistance(me: ScheduleOwner): Promise<Assistance[]> {
  const now = new Date().toISOString();
  const { data, error } = await me.supabase
    .from("delegations")
    .select("id, owner_trainer_id, scopes, all_clients, ends_at")
    .eq("delegate_trainer_id", me.userId)
    .eq("kind", "assistant")
    .eq("status", "active")
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`);
  if (error) fail("assistant delegations", error);
  return data;
}

/** Owner names as «Команда» shows them: a delegate may not read the owner's profile, my_delegations names them. */
async function ownerNames(me: ScheduleOwner, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await me.supabase.rpc("my_delegations");
  if (error) fail("owners", error);
  return new Map(data.filter((row) => row.side === "delegate" && ids.includes(row.other_id)).map((row) => [row.other_id, row.other_name ?? ""]));
}

/** Client names for pairs the caller sees as a delegate; a delegate has no alias of its own, so the profile's name. */
async function pairNames(me: ScheduleOwner, pairs: { id: string; client_id: string }[]): Promise<Map<string, string>> {
  if (!pairs.length) return new Map();
  const { data, error } = await me.supabase
    .from("profiles")
    .select("id, first_name, last_name, display_name, username")
    .in(
      "id",
      pairs.map((pair) => pair.client_id),
    );
  if (error) fail("clients", error);
  const people = new Map(data.map((row) => [row.id, row]));
  return new Map(pairs.map((pair) => [pair.id, displayName(people.get(pair.client_id))]));
}

/** Whether the caller assists anyone right now: the switch on «Клиенты» shows only then. */
export async function hasAssistance(): Promise<boolean> {
  const me = await loadScheduleOwner();
  if (!me) return false;
  return (await liveAssistance(me)).length > 0;
}

/** «Делегировано мне»: each owner the caller assists, with the live pairs the delegation covers. */
export async function loadAssistedOwners(): Promise<AssistedOwner[] | null> {
  const me = await loadScheduleOwner();
  if (!me) return null;
  const assistance = await liveAssistance(me);
  if (!assistance.length) return [];
  const owners = [...new Set(assistance.map((row) => row.owner_trainer_id))];
  const [names, pairs, chosen] = await Promise.all([
    ownerNames(me, owners),
    me.supabase.from("coachings").select("id, trainer_id, client_id").in("trainer_id", owners).in("status", LIVE),
    me.supabase
      .from("delegation_clients")
      .select("delegation_id, coaching_id")
      .in(
        "delegation_id",
        assistance.map((row) => row.id),
      ),
  ]);
  if (pairs.error) fail("pairs", pairs.error);
  if (chosen.error) fail("delegated pairs", chosen.error);
  const clientNames = await pairNames(me, pairs.data);
  return assistance
    .map((row) => {
      const picked = new Set(chosen.data.filter((pick) => pick.delegation_id === row.id).map((pick) => pick.coaching_id));
      const clients = pairs.data
        .filter((pair) => pair.trainer_id === row.owner_trainer_id && (row.all_clients || picked.has(pair.id)))
        .map((pair) => ({ coachingId: pair.id, name: clientNames.get(pair.id) ?? "" }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        delegationId: row.id,
        ownerId: row.owner_trainer_id,
        ownerName: names.get(row.owner_trainer_id) ?? "",
        scopes: row.scopes,
        allClients: row.all_clients,
        endsAt: row.ends_at,
        clients,
      };
    })
    .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

export type AssistedPair = {
  coachingId: string;
  clientId: string;
  clientName: string;
  ownerName: string;
  /** Every scope the caller's live delegations give for this pair. */
  scopes: Scope[];
  timeZone: string;
};

/** One pair the caller assists on, or null when no live delegation covers it (revoked, ended, never given). */
export async function loadAssistedPair(coachingId: string): Promise<AssistedPair | null> {
  if (!z.uuid().safeParse(coachingId).success) return null;
  const me = await loadScheduleOwner();
  if (!me) return null;
  const [assistance, pair] = await Promise.all([
    liveAssistance(me),
    me.supabase.from("coachings").select("id, trainer_id, client_id, status").eq("id", coachingId).maybeSingle(),
  ]);
  if (pair.error) fail("pair", pair.error);
  // The caller's own pair is not a delegated one: it opens in «Мои клиенты».
  const row = pair.data;
  if (!row || row.trainer_id === me.userId || !LIVE.includes(row.status as (typeof LIVE)[number])) return null;
  const owned = assistance.filter((item) => item.owner_trainer_id === row.trainer_id);
  if (!owned.length) return null;
  const partial = owned.filter((item) => !item.all_clients).map((item) => item.id);
  const { data: picks, error } = partial.length
    ? await me.supabase.from("delegation_clients").select("delegation_id").eq("coaching_id", coachingId).in("delegation_id", partial)
    : { data: [], error: null };
  if (error) fail("delegated pairs", error);
  const picked = new Set(picks.map((pick) => pick.delegation_id));
  const covering = owned.filter((item) => item.all_clients || picked.has(item.id));
  if (!covering.length) return null;
  const [owner, client] = await Promise.all([ownerNames(me, [row.trainer_id]), pairNames(me, [row])]);
  return {
    coachingId,
    clientId: row.client_id,
    clientName: client.get(coachingId) ?? "",
    ownerName: owner.get(row.trainer_id) ?? "",
    scopes: [...new Set(covering.flatMap((item) => item.scopes))],
    timeZone: me.timeZone,
  };
}

/**
 * The client's measurements for an assistant with the progress scope. RLS returns rows only while the client
 * shares measurements with the owner and has not switched assistants off (rules 4 and 6), so an empty list can
 * mean either; the card says so in one line.
 */
export async function loadAssistedMeasurements(pair: AssistedPair): Promise<Measurements> {
  const me = await loadScheduleOwner();
  if (!me) return { entries: [], today: todayIn(pair.timeZone) };
  const { data, error } = await me.supabase
    .from("measurements")
    .select("id, kind, value, measured_at, local_date, entered_by")
    .eq("client_id", pair.clientId)
    .order("measured_at", { ascending: false })
    .limit(2000);
  if (error) fail("measurements", error);
  const entries: MeasurementEntry[] = data.map((row) => ({
    id: row.id,
    kind: row.kind,
    value: Number(row.value),
    date: row.local_date,
    at: row.measured_at,
    author: row.entered_by === pair.clientId ? { kind: "client" } : row.entered_by === me.userId ? { kind: "me" } : { kind: "trainer", name: "" },
    mine: false,
  }));
  return { entries, today: todayIn(me.timeZone) };
}

export type AssistedNote = { id: string; body: string; visibleToClient: boolean; createdAt: string; mine: boolean };

/** The pair's notes for an assistant with the notes scope: the owner's and the caller's (RLS). */
export async function loadAssistedNotes(pair: AssistedPair): Promise<AssistedNote[]> {
  const me = await loadScheduleOwner();
  if (!me) return [];
  const { data, error } = await me.supabase
    .from("coaching_notes")
    .select("id, body, visible_to_client, created_at, author_id")
    .eq("coaching_id", pair.coachingId)
    .order("created_at", { ascending: false });
  if (error) fail("notes", error);
  return data.map((note) => ({
    id: note.id,
    body: note.body,
    visibleToClient: note.visible_to_client,
    createdAt: note.created_at,
    mine: note.author_id === me.userId,
  }));
}

export type AssistedHomework = Pick<Homework, "id" | "title" | "dueDate" | "repeatWeekdays" | "repeatUntil"> & {
  /** The deadline the list shows (currentOccurrence), or null for a homework without deadlines. */
  current: HomeworkOccurrence | null;
};

/**
 * The pair's homework that is not archived, for an assistant with the homework scope (RLS). Deadlines follow
 * the client's day, which only the pair's sides may read (homework_today), so "today" here is the caller's;
 * both default to Moscow, and a different zone can only shift an overdue mark by a day.
 */
export async function loadAssistedHomework(pair: AssistedPair): Promise<{ today: string; homework: AssistedHomework[] }> {
  const me = await loadScheduleOwner();
  const today = todayIn(pair.timeZone);
  if (!me) return { today, homework: [] };
  const { data, error } = await me.supabase
    .from("homework")
    .select("id, title, due_date, repeat_weekdays, repeat_until, homework_occurrences(id, due_on, done_at, comment, workout_log_id)")
    .eq("coaching_id", pair.coachingId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) fail("homework", error);
  return {
    today,
    homework: data.map((row) => {
      const occurrences = row.homework_occurrences
        .map((o) => ({ id: o.id, dueOn: o.due_on, doneAt: o.done_at, comment: o.comment, workoutLogId: o.workout_log_id }))
        .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
      return {
        id: row.id,
        title: row.title,
        dueDate: row.due_date,
        repeatWeekdays: row.repeat_weekdays,
        repeatUntil: row.repeat_until,
        current: occurrences.find((o) => !o.doneAt) ?? occurrences.at(-1) ?? null,
      };
    }),
  };
}
