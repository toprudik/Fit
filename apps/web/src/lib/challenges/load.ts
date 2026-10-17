import "server-only";

import { todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isChallengeMetric,
  isChallengeState,
  stateOf,
  toBoardRows,
  type BoardRow,
  type Challenge,
  type ChallengeState,
} from "./challenges";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = "id, trainer_id, group_id, title, metric, goal, starts_on, ends_on, leaderboard, cancelled_at, finished_at";

async function viewer(supabase: Supabase): Promise<{ id: string; timeZone: string } | null> {
  const { data: session } = await supabase.auth.getClaims();
  const id = session?.claims.sub;
  if (!id) return null;
  const { data } = await supabase.from("user_settings").select("time_zone").eq("user_id", id).maybeSingle();
  return { id, timeZone: data?.time_zone ?? "Europe/Moscow" };
}

type Row = {
  id: string;
  title: string;
  metric: string;
  goal: number | null;
  starts_on: string;
  ends_on: string;
  leaderboard: boolean;
  cancelled_at: string | null;
  finished_at: string | null;
};

function toChallenge(row: Row, state: ChallengeState): Challenge | null {
  if (!isChallengeMetric(row.metric)) return null;
  return {
    id: row.id,
    title: row.title,
    metric: row.metric,
    goal: row.goal,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    leaderboard: row.leaderboard,
    state,
  };
}

async function boardOf(supabase: Supabase, challengeId: string): Promise<BoardRow[]> {
  const { data, error } = await supabase.rpc("challenge_board", { p_challenge_id: challengeId });
  if (error) throw new Error(`loading a challenge board failed: ${error.code}`);
  return toBoardRows(data);
}

export type GroupChallenge = Challenge & { participants: number };

/** The challenges of a trainer's group, newest first, with how many joined. Empty for anyone else. */
export async function loadGroupChallenges(groupId: string): Promise<{ challenges: GroupChallenge[]; today: string } | null> {
  if (!ID.test(groupId)) return null;
  const supabase = await createSupabaseServerClient();
  const me = await viewer(supabase);
  if (!me) return null;
  const { data, error } = await supabase
    .from("challenges")
    .select(COLUMNS)
    .eq("group_id", groupId)
    .eq("trainer_id", me.id)
    .order("starts_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`loading group challenges failed: ${error.code}`);
  const today = todayIn(me.timeZone);
  const ids = data.map((row) => row.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: joined, error: joinedError } = await supabase.from("challenge_participants").select("challenge_id").in("challenge_id", ids);
    if (joinedError) throw new Error(`loading challenge participants failed: ${joinedError.code}`);
    for (const row of joined) counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
  }
  const challenges = data.flatMap((row) => {
    const challenge = toChallenge(row, stateOf(row, today));
    return challenge ? [{ ...challenge, participants: counts.get(row.id) ?? 0 }] : [];
  });
  return { challenges, today };
}

export type TrainerChallenge = { challenge: Challenge; groupId: string; groupName: string; board: BoardRow[] };

/** One challenge of the signed-in trainer with its whole leaderboard. Null when it isn't theirs. */
export async function loadTrainerChallenge(challengeId: string): Promise<TrainerChallenge | null> {
  if (!ID.test(challengeId)) return null;
  const supabase = await createSupabaseServerClient();
  const me = await viewer(supabase);
  if (!me) return null;
  const { data: row, error } = await supabase.from("challenges").select(COLUMNS).eq("id", challengeId).eq("trainer_id", me.id).maybeSingle();
  if (error) throw new Error(`loading a challenge failed: ${error.code}`);
  if (!row) return null;
  const challenge = toChallenge(row, stateOf(row, todayIn(me.timeZone)));
  if (!challenge) return null;
  const [group, board] = await Promise.all([
    supabase.from("groups").select("name").eq("id", row.group_id).maybeSingle(),
    boardOf(supabase, challengeId),
  ]);
  return { challenge, groupId: row.group_id, groupName: group.data?.name ?? "", board };
}

export type MyChallenge = Challenge & {
  trainerName: string;
  coachingId: string;
  joined: boolean;
  shared: boolean;
  showOnLeaderboard: boolean;
  alias: string | null;
  score: number | null;
};

/** The challenges of the signed-in client's groups: running, upcoming and finished in the last month. None signed out. */
export async function loadMyChallenges(): Promise<MyChallenge[]> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return [];
  const { data, error } = await supabase.rpc("my_challenges");
  if (error) throw new Error(`loading my challenges failed: ${error.code}`);
  return data.flatMap((row) => {
    if (!isChallengeMetric(row.metric) || !isChallengeState(row.state)) return [];
    return [
      {
        id: row.id,
        title: row.title,
        metric: row.metric,
        goal: row.goal ?? null,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        leaderboard: row.leaderboard,
        state: row.state,
        trainerName: row.trainer_name ?? "",
        coachingId: row.coaching_id,
        joined: row.joined,
        shared: row.shared,
        showOnLeaderboard: row.show_on_leaderboard,
        alias: row.alias ?? null,
        score: row.joined ? row.score : null,
      },
    ];
  });
}

/** One challenge of the client's groups, with the leaderboard once they joined. Null when it isn't theirs. */
export async function loadMyChallenge(challengeId: string): Promise<{ challenge: MyChallenge; board: BoardRow[] } | null> {
  if (!ID.test(challengeId)) return null;
  const challenge = (await loadMyChallenges()).find((item) => item.id === challengeId);
  if (!challenge) return null;
  if (!challenge.joined) return { challenge, board: [] };
  const supabase = await createSupabaseServerClient();
  const board = await boardOf(supabase, challengeId);
  const mine = board.find((row) => row.isMe);
  return { challenge: { ...challenge, score: mine?.score ?? challenge.score }, board };
}
