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
};

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
  const [plan, requests, profile, delegations, pairs] = await Promise.all([
    owner.supabase.rpc("has_entitlement", {
      p_user: owner.userId,
      p_feature: "trainer.delegation",
    }),
    owner.supabase.from("access_requests").select("plan_code, status, created_at").eq("user_id", owner.userId),
    owner.supabase.from("trainer_profiles").select("verification_status").eq("user_id", owner.userId).maybeSingle(),
    loadDelegations(owner),
    owner.supabase.from("coachings").select("id").eq("trainer_id", owner.userId).in("status", ["trial", "active"]),
  ]);
  if (plan.error) fail("plan", plan.error);
  if (requests.error) fail("access requests", requests.error);
  if (profile.error) fail("trainer profile", profile.error);
  if (pairs.error) fail("pairs", pairs.error);
  const names = await clientNames(
    owner.supabase,
    pairs.data.map((pair) => pair.id),
  );
  return {
    timeZone: owner.timeZone,
    canDelegate: plan.data === true,
    requested: requestedPlans(requests.data).has(PAID_PLAN.trainer),
    verified: profile.data?.verification_status === "verified",
    delegations,
    clients: [...names].map(([coachingId, name]) => ({ coachingId, name })).sort((a, b) => a.name.localeCompare(b.name)),
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
