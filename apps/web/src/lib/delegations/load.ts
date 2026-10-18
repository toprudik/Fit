import "server-only";
import { DEFAULT_TIME_ZONE, PAID_PLAN, requestedPlans } from "@/lib/plans/plans";
import { clientNames, loadScheduleOwner } from "@/lib/schedule/load";
import type { Database } from "@/lib/supabase/database.types";

type Owner = NonNullable<Awaited<ReturnType<typeof loadScheduleOwner>>>;
type Scope = Database["public"]["Enums"]["delegation_scope"];
type Kind = Database["public"]["Enums"]["delegation_kind"];
type Status = Database["public"]["Enums"]["delegation_status"];

function fail(what: string, error: { code?: string }): never {
  throw new Error(`loading the ${what} failed: ${error.code}`);
}

export type Delegation = {
  id: string;
  side: "owner" | "delegate";
  kind: Kind;
  status: Status;
  /** The delegate for the owner, the owner for the delegate; null while an invite waits. */
  otherName: string | null;
  sessionId: string | null;
  sessionStartsAt: string | null;
  scopes: Scope[];
  allClients: boolean;
  clients: number;
  endsAt: string | null;
};

export type TeamData = {
  timeZone: string;
  /** Delegating is Pro (trainer.delegation); being a delegate is open to any verified trainer. */
  canDelegate: boolean;
  requested: boolean;
  verified: boolean;
  delegations: Delegation[];
  /** Live pairs an assistant can be given. */
  clients: { coachingId: string; name: string }[];
  /** What delegates did for the owner's pairs, newest first (rule 8). */
  journal: JournalEntry[];
  /** The owner's sessions ahead with no substitute yet, earliest first, to hand several over at once. */
  sessions: SubstituteSession[];
};

export type SubstituteSession = { id: string; startsAt: string; title: string | null };

export type JournalEntry = { at: string; action: string; delegateName: string | null; clientName: string | null };

const JOURNAL_SIZE = 30;
/** How far ahead and how many sessions the owner can pick from for one substitute invite. */
const SUBSTITUTE_DAYS = 60;
const SUBSTITUTE_SESSIONS = 60;

/** Sessions ahead without a live substitute; a personal session is named by its client. */
async function loadSubstituteSessions(owner: Owner, delegations: Delegation[]): Promise<SubstituteSession[]> {
  const now = Date.now();
  const { data, error } = await owner.supabase
    .from("sessions")
    .select("id, title, starts_at")
    .eq("trainer_id", owner.userId)
    .eq("status", "scheduled")
    .gt("starts_at", new Date(now).toISOString())
    .lt("starts_at", new Date(now + SUBSTITUTE_DAYS * 86_400_000).toISOString())
    .order("starts_at")
    .limit(SUBSTITUTE_SESSIONS);
  if (error) fail("sessions", error);
  const taken = new Set(
    delegations.filter((row) => row.side === "owner" && (row.status === "pending" || row.status === "active")).map((row) => row.sessionId),
  );
  const free = data.filter((session) => !taken.has(session.id));
  const untitled = free.filter((session) => !session.title).map((session) => session.id);
  const bookings = untitled.length
    ? await owner.supabase.from("bookings").select("session_id, coaching_id").in("session_id", untitled)
    : { data: [], error: null };
  if (bookings.error) fail("bookings", bookings.error);
  const names = await clientNames(owner.supabase, (bookings.data ?? []).map((row) => row.coaching_id));
  const client = new Map((bookings.data ?? []).map((row) => [row.session_id, names.get(row.coaching_id) ?? null]));
  return free.map((session) => ({ id: session.id, startsAt: session.starts_at, title: session.title ?? client.get(session.id) ?? null }));
}

async function loadDelegations(owner: Owner): Promise<Delegation[]> {
  const { data, error } = await owner.supabase.rpc("my_delegations");
  if (error) fail("delegations", error);
  return data.map((row) => ({
    id: row.id,
    side: row.side === "owner" ? "owner" : "delegate",
    kind: row.kind,
    status: row.status,
    otherName: row.other_name,
    sessionId: row.session_id,
    sessionStartsAt: row.session_starts_at,
    scopes: row.scopes,
    allClients: row.all_clients,
    clients: row.clients,
    endsAt: row.ends_at,
  }));
}

/** «Команда» (screens.md /trainer/team): the owner's assistants and substitutes and what others delegated to the caller. */
export async function loadTeam(): Promise<TeamData | null> {
  const owner = await loadScheduleOwner();
  if (!owner) return null;
  const [plan, requests, profile, delegations, pairs, journal] = await Promise.all([
    owner.supabase.rpc("has_entitlement", {
      p_user: owner.userId,
      p_feature: "trainer.delegation",
    }),
    owner.supabase.from("access_requests").select("plan_code, status, created_at").eq("user_id", owner.userId),
    owner.supabase.from("trainer_profiles").select("verification_status").eq("user_id", owner.userId).maybeSingle(),
    loadDelegations(owner),
    owner.supabase.from("coachings").select("id").eq("trainer_id", owner.userId).in("status", ["trial", "active"]),
    owner.supabase.rpc("delegate_journal").limit(JOURNAL_SIZE),
  ]);
  if (plan.error) fail("plan", plan.error);
  if (requests.error) fail("access requests", requests.error);
  if (profile.error) fail("trainer profile", profile.error);
  if (pairs.error) fail("pairs", pairs.error);
  if (journal.error) fail("delegate journal", journal.error);
  const live = new Set(pairs.data.map((pair) => pair.id));
  const [names, sessions] = await Promise.all([
    clientNames(owner.supabase, [...live, ...journal.data.map((row) => row.coaching_id)]),
    plan.data === true ? loadSubstituteSessions(owner, delegations) : Promise.resolve([]),
  ]);
  return {
    timeZone: owner.timeZone,
    canDelegate: plan.data === true,
    requested: requestedPlans(requests.data).has(PAID_PLAN.trainer),
    verified: profile.data?.verification_status === "verified",
    delegations,
    clients: [...names]
      .filter(([coachingId]) => live.has(coachingId))
      .map(([coachingId, name]) => ({ coachingId, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    journal: journal.data.map((row) => ({
      at: row.at,
      action: row.action,
      delegateName: row.delegate_name,
      clientName: names.get(row.coaching_id) ?? null,
    })),
    sessions,
  };
}

/** The live substitute of a session for its owner's session page, or null. */
export async function loadSessionDelegation(sessionId: string): Promise<{ delegation: Delegation | null; canDelegate: boolean } | null> {
  const owner = await loadScheduleOwner();
  if (!owner) return null;
  const [delegations, plan] = await Promise.all([
    loadDelegations(owner),
    owner.supabase.rpc("has_entitlement", {
      p_user: owner.userId,
      p_feature: "trainer.delegation",
    }),
  ]);
  if (plan.error) fail("plan", plan.error);
  const delegation =
    delegations.find((row) => row.side === "owner" && row.sessionId === sessionId && (row.status === "pending" || row.status === "active")) ?? null;
  return { delegation, canDelegate: plan.data === true };
}

export type DelegatedSession = {
  id: string;
  ownerName: string | null;
  kind: Database["public"]["Enums"]["session_kind"];
  title: string | null;
  startsAt: string;
  endsAt: string;
  mode: Database["public"]["Enums"]["session_mode"];
  location: string | null;
  timeZone: string;
  participants: {
    bookingId: string;
    coachingId: string;
    name: string;
    status: string;
  }[];
};

/** A session the caller substitutes on, or null once it ended or was never theirs (1.5). */
export async function loadDelegatedSession(sessionId: string): Promise<DelegatedSession | null> {
  const owner = await loadScheduleOwner();
  if (!owner) return null;
  const { data, error } = await owner.supabase.rpc("delegated_session", { p_session_id: sessionId }).maybeSingle();
  if (error) fail("delegated session", error);
  if (!data) return null;
  const participants = Array.isArray(data.participants) ? data.participants : [];
  return {
    id: data.id,
    ownerName: data.owner_name,
    kind: data.kind,
    title: data.title,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    mode: data.mode,
    location: data.location,
    timeZone: owner.timeZone,
    participants: participants.flatMap((row) =>
      row && typeof row === "object" && !Array.isArray(row) && typeof row.booking_id === "string"
        ? [
            {
              bookingId: row.booking_id,
              coachingId: String(row.coaching_id ?? ""),
              name: typeof row.name === "string" ? row.name : "",
              status: String(row.status ?? ""),
            },
          ]
        : [],
    ),
  };
}

export type InviteDetails = {
  kind: Kind;
  ownerName: string | null;
  scopes: Scope[];
  allClients: boolean;
  clients: number;
  sessionStartsAt: string | null;
  /** Every session of a substitute invite still ahead, earliest first; one for a single session. */
  sessionsStartsAt: string[];
  endsAt: string | null;
  timeZone: string;
};

/** What an invite offers, for the accept page; the reason when it can't be used. */
export async function loadInvite(token: string): Promise<InviteDetails | "signed-out" | "not-found" | "expired"> {
  const owner = await loadScheduleOwner();
  if (!owner) return "signed-out";
  const { data, error } = await owner.supabase.rpc("delegation_invite", { p_token: token }).maybeSingle();
  if (error) return error.message === "invite_expired" ? "expired" : "not-found";
  if (!data) return "not-found";
  return {
    kind: data.kind,
    ownerName: data.owner_name,
    scopes: data.scopes,
    allClients: data.all_clients,
    clients: data.clients,
    sessionStartsAt: data.session_starts_at,
    sessionsStartsAt: data.sessions_starts_at,
    endsAt: data.ends_at,
    timeZone: owner.timeZone,
  };
}

export type PairDelegate = {
  kind: Kind;
  name: string | null;
  sessionStartsAt: string | null;
};

/** For the client's sharing page: who else works with them for this trainer, and the assistants' switch. */
export async function loadPairDelegates(coachingId: string): Promise<{
  delegates: PairDelegate[];
  progressBlocked: boolean;
  timeZone: string;
}> {
  const owner = await loadScheduleOwner();
  if (!owner)
    return {
      delegates: [],
      progressBlocked: false,
      timeZone: DEFAULT_TIME_ZONE,
    };
  const [delegates, block] = await Promise.all([
    owner.supabase.rpc("my_pair_delegates"),
    owner.supabase.from("assistant_progress_blocks").select("coaching_id").eq("coaching_id", coachingId).maybeSingle(),
  ]);
  if (delegates.error) fail("pair delegates", delegates.error);
  if (block.error) fail("assistant switch", block.error);
  return {
    delegates: delegates.data
      .filter((row) => row.coaching_id === coachingId)
      .map((row) => ({
        kind: row.kind,
        name: row.delegate_name,
        sessionStartsAt: row.session_starts_at,
      })),
    progressBlocked: block.data !== null,
    timeZone: owner.timeZone,
  };
}
