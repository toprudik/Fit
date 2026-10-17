import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PAID_PLAN, requestedPlans } from "@/lib/plans/plans";
import type { Json } from "@/lib/supabase/database.types";
import { DELETED_CLIENT_ID, displayName, isLive, isPairId, passIsEnding, type ClientItem, type CoachingStatus } from "./clients";
import { todayMilestones, type Milestone, type TodayMilestones } from "./milestones";

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

  const { data: pairs, error } = await supabase.from("coachings").select("id, client_id, status, started_at").eq("trainer_id", userId);
  if (error) fail("pairs", error);
  if (!pairs.length) return { items: [], timeZone: me.timeZone };

  const ids = pairs.map((pair) => pair.id);
  const [meta, people, balances, stats, passes, intakes, deletions] = await Promise.all([
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
    // RLS returns a client's intakes only while they show them to this trainer (can_view, INTK-2).
    supabase
      .from("intakes")
      .select("user_id, parq_flagged, submitted_at")
      .in(
        "user_id",
        pairs.map((pair) => pair.client_id),
      )
      .order("submitted_at", { ascending: false }),
    supabase
      .from("account_deletions")
      .select("user_id")
      .in(
        "user_id",
        pairs.map((pair) => pair.client_id),
      )
      .is("cancelled_at", null),
  ]);
  for (const [what, result] of Object.entries({ meta, people, balances, stats, passes, intakes, deletions })) {
    if (result.error) fail(what, result.error);
  }

  const now = new Date();
  const byId = <T extends { coaching_id: string | null }>(rows: T[] | null) => new Map((rows ?? []).map((row) => [row.coaching_id, row]));
  const metaById = byId(meta.data);
  const balanceById = byId(balances.data);
  const statsById = byId(stats.data);
  const personById = new Map((people.data ?? []).map((person) => [person.id, person]));
  const latestIntake = new Map<string, boolean>();
  for (const row of intakes.data ?? []) if (!latestIntake.has(row.user_id)) latestIntake.set(row.user_id, row.parq_flagged);
  const deleting = new Set((deletions.data ?? []).map((row) => row.user_id));

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
      parqFlagged: pair.status !== "ended" && (latestIntake.get(pair.client_id) ?? false),
      deleting: pair.status !== "ended" && deleting.has(pair.client_id),
      deleted: pair.client_id === DELETED_CLIENT_ID,
    };
  });
  return { items, timeZone: me.timeZone };
}

/** Milestones for the trainer's "Сегодня": fresh ones and the ones the next session reaches. Null without a session. */
export async function loadTodayMilestones(): Promise<TodayMilestones | null> {
  const clients = await loadTrainerClients();
  if (!clients) return null;
  const ids = clients.items.map((item) => item.coachingId);
  if (!ids.length) return { reached: [], upcoming: [] };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("milestones").select("id, coaching_id, kind, achieved_at").in("coaching_id", ids).order("achieved_at");
  if (error) fail("milestones", error);
  const pairs = clients.items.map((item) => ({
    coachingId: item.coachingId,
    name: item.name,
    live: isLive(item.status),
    archived: item.archived,
    attended: item.attended,
    milestones: data
      .filter((row) => row.coaching_id === item.coachingId)
      .map((row) => ({ id: row.id, kind: row.kind, achievedAt: row.achieved_at })),
  }));
  return todayMilestones(pairs, new Date());
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
  /** Set when the pair ended for the plan limit (К12, Q65), not for a reason someone typed. */
  endedForLimit: boolean;
  timeZone: string;
  /** `deleted`: the client's account is gone and the pair points to the «Удалённый клиент» stub. */
  partner: { name: string; photoUrl: string | null; username: string | null; isCard: boolean; deleted: boolean };
  /** When the viewer last asked the partner to get in touch ("Попросить связаться"), or null. */
  contactRequestedAt: string | null;
  /** When the partner's pending account deletion takes effect (R10), or null. */
  partnerDeletingOn: string | null;
  attended: number;
  milestones: Milestone[];
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
    .select("id, trainer_id, client_id, status, started_at, ended_at, ended_by, end_reason, self_book_on_debt")
    .eq("id", coachingId)
    .eq(side === "trainer" ? "trainer_id" : "client_id", userId)
    .maybeSingle();
  if (error) fail("pair", error);
  if (!pair) return null;

  const partnerId = side === "trainer" ? pair.client_id : pair.trainer_id;
  const [person, meta, balance, stats, passes, notes, milestones, contact, deletion] = await Promise.all([
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
    supabase.from("milestones").select("id, kind, achieved_at").eq("coaching_id", pair.id).order("achieved_at"),
    supabase
      .from("contact_requests")
      .select("created_at")
      .eq("requester_id", userId)
      .eq("recipient_id", partnerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Partners read a pending deletion for the "удаляет аккаунт" label (R10); the row holds only dates.
    supabase.from("account_deletions").select("scheduled_for").eq("user_id", partnerId).is("cancelled_at", null).maybeSingle(),
  ]);
  for (const [what, result] of Object.entries({ person, meta, balance, stats, passes, notes, milestones, contact, deletion })) {
    if (result.error) fail(what, result.error);
  }

  return {
    coachingId: pair.id,
    side,
    status: pair.status,
    startedAt: pair.started_at,
    endedAt: pair.ended_at,
    endedByMe: pair.ended_by === userId,
    endedForLimit: pair.status === "ended" && pair.ended_by === pair.trainer_id && pair.end_reason === "plan_limit_reached",
    timeZone: me.timeZone,
    partner: {
      name: displayName(person.data ?? undefined, meta.data?.client_alias),
      photoUrl: person.data?.photo_url ?? null,
      username: person.data?.username ?? null,
      isCard: Boolean(person.data?.managed_by_trainer_id),
      deleted: partnerId === DELETED_CLIENT_ID,
    },
    contactRequestedAt: contact.data?.created_at ?? null,
    partnerDeletingOn: deletion.data?.scheduled_for ?? null,
    attended: stats.data?.attended_count ?? 0,
    milestones: (milestones.data ?? []).map((row) => ({ id: row.id, kind: row.kind, achievedAt: row.achieved_at })),
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

/** The Free trainer's client count (PLAN-1): null on Pro or without a session. */
export type ClientLimit = { active: number; limit: number; full: boolean; requested: boolean };

export async function loadClientLimit(): Promise<ClientLimit | null> {
  const me = await viewer();
  if (!me) return null;
  const [plans, requests] = await Promise.all([
    me.supabase.rpc("my_plan"),
    me.supabase.from("access_requests").select("plan_code, status, created_at").eq("user_id", me.userId),
  ]);
  if (plans.error) fail("plan", plans.error);
  if (requests.error) fail("access requests", requests.error);
  const row = plans.data.find((plan) => plan.side === "trainer");
  if (!row || row.client_limit === null || row.active_clients === null) return null;
  return {
    active: row.active_clients,
    limit: row.client_limit,
    full: row.active_clients >= row.client_limit,
    requested: requestedPlans(requests.data).has(PAID_PLAN.trainer),
  };
}

/** Undecided "Это <Имя>?" questions of the signed-in trainer, newest first, with the name of who came. */
export async function loadPendingClaims(): Promise<{ id: string; name: string }[]> {
  const me = await viewer();
  if (!me) return [];
  const { data: claims, error } = await me.supabase
    .from("managed_client_claims")
    .select("id, claimant_id, created_at")
    .eq("trainer_id", me.userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) fail("claims", error);
  if (!claims.length) return [];
  const { data: people, error: peopleError } = await me.supabase
    .from("profiles")
    .select(PERSON_COLUMNS)
    .in(
      "id",
      claims.map((claim) => claim.claimant_id),
    );
  if (peopleError) fail("claimants", peopleError);
  const byId = new Map(people.map((person) => [person.id, person]));
  return claims.map((claim) => ({ id: claim.id, name: displayName(byId.get(claim.claimant_id)) }));
}

export type ClaimCard = {
  id: string;
  coachingId: string;
  name: string;
  startedAt: string;
  sessions: number;
  passes: number;
  payments: number;
  notes: number;
  measurements: number;
};

export type ClaimDetail = {
  id: string;
  status: "pending" | "merged" | "rejected";
  newCoachingId: string | null;
  limitFull: boolean;
  person: { name: string; photoUrl: string | null; firstName: string | null; lastName: string | null; username: string | null };
  cards: ClaimCard[];
  timeZone: string;
};

const text = (value: Json | undefined) => (typeof value === "string" ? value : null);
const count = (value: Json | undefined) => (typeof value === "number" ? value : 0);

/** The "Это тот же клиент?" screen (get_managed_client_claim); null when the claim is not the trainer's. */
export async function loadClaim(claimId: string): Promise<ClaimDetail | null> {
  if (!isPairId(claimId)) return null;
  const me = await viewer();
  if (!me) return null;
  const { data, error } = await me.supabase.rpc("get_managed_client_claim", { p_claim_id: claimId });
  if (error?.message === "claim_not_found") return null;
  if (error) fail("claim", error);
  const claim = (data ?? {}) as Record<string, Json | undefined>;
  const person = (claim.person ?? {}) as Record<string, Json | undefined>;
  const status = claim.status === "merged" || claim.status === "rejected" ? claim.status : "pending";
  const naming = { first_name: text(person.first_name), last_name: text(person.last_name), username: text(person.username) };
  return {
    id: claimId,
    status,
    newCoachingId: text(claim.new_coaching_id),
    limitFull: claim.limit_full === true,
    person: {
      name: displayName(naming),
      photoUrl: text(person.photo_url),
      firstName: naming.first_name,
      lastName: naming.last_name,
      username: naming.username,
    },
    cards: (Array.isArray(claim.cards) ? claim.cards : []).map((value) => {
      const card = (value ?? {}) as Record<string, Json | undefined>;
      return {
        id: text(card.id) ?? "",
        coachingId: text(card.coaching_id) ?? "",
        name: text(card.name) ?? "",
        startedAt: text(card.started_at) ?? "",
        sessions: count(card.sessions),
        passes: count(card.passes),
        payments: count(card.payments),
        notes: count(card.notes),
        measurements: count(card.measurements),
      };
    }),
    timeZone: me.timeZone,
  };
}
