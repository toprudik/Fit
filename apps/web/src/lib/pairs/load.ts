import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { displayName, isPairId, passIsEnding, type ClientItem, type CoachingStatus } from "./clients";

const DEFAULT_TIME_ZONE = "Europe/Moscow";

/** The signed-in user's id and time zone, or null without a session. */
async function viewer() {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return null;
  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle();
  return { supabase, userId, timeZone: settings?.time_zone ?? DEFAULT_TIME_ZONE };
}

function fail(what: string, error: { code: string } | null): never {
  throw new Error(`loading ${what} failed: ${error?.code}`);
}

// telegram_id is not granted, so profile columns are always listed.
const PERSON_COLUMNS = "id, first_name, last_name, display_name, username, photo_url, managed_by_trainer_id";

/** Every pair of the signed-in trainer as list rows, in any status. Null without a session. */
export async function loadTrainerClients(): Promise<{ items: ClientItem[]; timeZone: string } | null> {
  const me = await viewer();
  if (!me) return null;
  const { supabase, userId } = me;

  const { data: pairs, error } = await supabase
    .from("coachings")
    .select("id, client_id, status, started_at")
    .eq("trainer_id", userId);
  if (error) fail("pairs", error);
  if (!pairs.length) return { items: [], timeZone: me.timeZone };

  const ids = pairs.map((pair) => pair.id);
  const [meta, people, balances, stats, passes] = await Promise.all([
    supabase.from("coaching_trainer_meta").select("coaching_id, client_alias, archived_at").in("coaching_id", ids),
    supabase
      .from("profiles")
      .select(PERSON_COLUMNS)
      .in(
        "id",
        pairs.map((pair) => pair.client_id),
      ),
    supabase.from("coaching_balances").select("coaching_id, available_sessions, debt_sessions").eq("trainer_id", userId),
    supabase.from("coaching_stats").select("coaching_id, attended_count, next_session_at").eq("trainer_id", userId),
    supabase
      .from("pass_balances")
      .select("coaching_id, status, available, effective_expires_at")
      .eq("trainer_id", userId)
      .in("status", ["active", "frozen"]),
  ]);
  for (const [what, result] of Object.entries({ meta, people, balances, stats, passes })) {
    if (result.error) fail(what, result.error);
  }

  const now = new Date();
  const byId = <T extends { coaching_id: string | null }>(rows: T[] | null) => new Map((rows ?? []).map((row) => [row.coaching_id, row]));
  const metaById = byId(meta.data);
  const balanceById = byId(balances.data);
  const statsById = byId(stats.data);
  const personById = new Map((people.data ?? []).map((person) => [person.id, person]));

  const items = pairs.map((pair): ClientItem => {
    const person = personById.get(pair.client_id);
    const pairPasses = (passes.data ?? []).filter((pass) => pass.coaching_id === pair.id);
    return {
      coachingId: pair.id,
      name: displayName(person, metaById.get(pair.id)?.client_alias),
      photoUrl: person?.photo_url ?? null,
      isCard: Boolean(person?.managed_by_trainer_id),
      status: pair.status,
      archived: Boolean(metaById.get(pair.id)?.archived_at),
      startedAt: pair.started_at,
      attended: statsById.get(pair.id)?.attended_count ?? 0,
      nextSessionAt: statsById.get(pair.id)?.next_session_at ?? null,
      availableSessions: balanceById.get(pair.id)?.available_sessions ?? 0,
      debtSessions: balanceById.get(pair.id)?.debt_sessions ?? 0,
      hasPass: pairPasses.length > 0,
      passEnding: passIsEnding(pairPasses, now),
    };
  });
  return { items, timeZone: me.timeZone };
}

export type PairPass = {
  id: string;
  title: string;
  sessionsTotal: number;
  available: number;
  expiresAt: string | null;
  status: string;
};

export type PairNote = {
  id: string;
  body: string;
  visibleToClient: boolean;
  createdAt: string;
  updatedAt: string;
  /** Only the note's author may change it (policy "author trainer updates"). */
  mine: boolean;
};

/** One pair as its trainer or its client sees it. */
export type PairDetail = {
  coachingId: string;
  side: "trainer" | "client";
  status: CoachingStatus;
  startedAt: string;
  endedAt: string | null;
  endedByMe: boolean;
  timeZone: string;
  partner: { name: string; photoUrl: string | null; username: string | null; isCard: boolean };
  attended: number;
  nextSessionAt: string | null;
  availableSessions: number;
  debtSessions: number;
  passes: PairPass[];
  notes: PairNote[];
  /** Trainer side only. */
  archived: boolean;
  selfBookOnDebt: boolean;
};

/**
 * The pair with this id when the signed-in user is its trainer (side "trainer") or its client (side
 * "client"); null when there is no session, no such pair, or it belongs to someone else. RLS shows the
 * client only the notes the trainer made visible (PAIR-2).
 */
export async function loadPair(coachingId: string, side: "trainer" | "client"): Promise<PairDetail | null> {
  if (!isPairId(coachingId)) return null;
  const me = await viewer();
  if (!me) return null;
  const { supabase, userId } = me;

  const { data: pair, error } = await supabase
    .from("coachings")
    .select("id, trainer_id, client_id, status, started_at, ended_at, ended_by, self_book_on_debt")
    .eq("id", coachingId)
    .eq(side === "trainer" ? "trainer_id" : "client_id", userId)
    .maybeSingle();
  if (error) fail("pair", error);
  if (!pair) return null;

  const partnerId = side === "trainer" ? pair.client_id : pair.trainer_id;
  const [person, meta, balance, stats, passes, notes] = await Promise.all([
    supabase.from("profiles").select(PERSON_COLUMNS).eq("id", partnerId).maybeSingle(),
    side === "trainer"
      ? supabase.from("coaching_trainer_meta").select("client_alias, archived_at").eq("coaching_id", pair.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("coaching_balances").select("available_sessions, debt_sessions").eq("coaching_id", pair.id).maybeSingle(),
    supabase.from("coaching_stats").select("attended_count, next_session_at").eq("coaching_id", pair.id).maybeSingle(),
    supabase
      .from("pass_balances")
      .select("pass_id, title, sessions_total, available, effective_expires_at, status")
      .eq("coaching_id", pair.id)
      .in("status", ["active", "frozen"]),
    supabase
      .from("coaching_notes")
      .select("id, author_id, body, visible_to_client, created_at, updated_at")
      .eq("coaching_id", pair.id)
      .order("created_at", { ascending: false }),
  ]);
  for (const [what, result] of Object.entries({ person, meta, balance, stats, passes, notes })) {
    if (result.error) fail(what, result.error);
  }

  return {
    coachingId: pair.id,
    side,
    status: pair.status,
    startedAt: pair.started_at,
    endedAt: pair.ended_at,
    endedByMe: pair.ended_by === userId,
    timeZone: me.timeZone,
    partner: {
      name: displayName(person.data ?? undefined, meta.data?.client_alias),
      photoUrl: person.data?.photo_url ?? null,
      username: person.data?.username ?? null,
      isCard: Boolean(person.data?.managed_by_trainer_id),
    },
    attended: stats.data?.attended_count ?? 0,
    nextSessionAt: stats.data?.next_session_at ?? null,
    availableSessions: balance.data?.available_sessions ?? 0,
    debtSessions: balance.data?.debt_sessions ?? 0,
    passes: (passes.data ?? []).map((pass) => ({
      id: pass.pass_id ?? "",
      title: pass.title ?? "",
      sessionsTotal: pass.sessions_total ?? 0,
      available: pass.available ?? 0,
      expiresAt: pass.effective_expires_at,
      status: pass.status ?? "active",
    })),
    notes: (notes.data ?? []).map((note) => ({
      id: note.id,
      body: note.body,
      visibleToClient: note.visible_to_client,
      createdAt: note.created_at,
      updatedAt: note.updated_at,
      mine: note.author_id === userId,
    })),
    archived: Boolean(meta.data?.archived_at),
    selfBookOnDebt: pair.self_book_on_debt,
  };
}
