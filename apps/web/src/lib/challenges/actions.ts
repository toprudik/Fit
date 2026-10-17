"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CHALLENGE_ALIAS_MAX,
  CHALLENGE_TITLE_MAX,
  isChallengeGoal,
  isChallengeMetric,
  isChallengeWeeks,
  joinErrorOf,
  type JoinError,
} from "./challenges";

const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;
const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function cleanAlias(alias: unknown): string | null | undefined {
  if (alias === null || alias === undefined) return null;
  if (typeof alias !== "string") return undefined;
  const trimmed = alias.trim();
  if (trimmed.length > CHALLENGE_ALIAS_MAX) return undefined;
  return trimmed || null;
}

export type ChallengeInput = {
  groupId: string;
  title: string;
  metric: string;
  weeks: number;
  startsOn: string;
  goal: number | null;
  leaderboard: boolean;
};

/** "Новый челлендж" in a group (wave-3 §2.3-9). Returns the new challenge's id. */
export async function createChallenge(input: ChallengeInput): Promise<{ ok: true; value: string } | { ok: false; reason: "invalid" | "plan" | "failed" }> {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (
    !isId(input.groupId) ||
    !title ||
    title.length > CHALLENGE_TITLE_MAX ||
    !isChallengeMetric(input.metric) ||
    !isChallengeWeeks(input.weeks) ||
    !isDay(input.startsOn) ||
    (input.goal !== null && !isChallengeGoal(input.goal)) ||
    typeof input.leaderboard !== "boolean"
  ) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_challenge", {
    p_group_id: input.groupId,
    p_title: title,
    p_metric: input.metric,
    p_weeks: input.weeks,
    p_starts_on: input.startsOn,
    p_goal: input.goal ?? undefined,
    p_leaderboard: input.leaderboard,
  });
  if (error) {
    if (error.code === "42501" && error.message === "plan_required") return { ok: false, reason: "plan" };
    if (error.code === "22023") return { ok: false, reason: "invalid" };
    console.error("creating a challenge failed", error.code);
    return { ok: false, reason: "failed" };
  }
  refresh();
  return { ok: true, value: data };
}

/** The trainer stops a challenge before its end; nobody gets its badges. */
export async function cancelChallenge(challengeId: unknown): Promise<{ ok: boolean }> {
  if (!isId(challengeId)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_challenge", { p_challenge_id: challengeId });
  if (error) {
    console.error("cancelling a challenge failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}

/** The client joins a challenge of their group, on the leaderboard only when they ask for it (Q40). */
export async function joinChallenge(input: { challengeId: string; showOnLeaderboard: boolean; alias: string | null }): Promise<{ ok: true } | { ok: false; reason: JoinError }> {
  const alias = cleanAlias(input.alias);
  if (!isId(input.challengeId) || typeof input.showOnLeaderboard !== "boolean" || alias === undefined) return { ok: false, reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("join_challenge", {
    p_challenge_id: input.challengeId,
    p_show_on_leaderboard: input.showOnLeaderboard,
    p_alias: alias ?? undefined,
  });
  if (error) {
    const reason = joinErrorOf(error.message);
    if (reason === "failed") console.error("joining a challenge failed", error.code);
    return { ok: false, reason };
  }
  refresh();
  return { ok: true };
}

/** The participant shows or hides themselves on the leaderboard and sets an alias (§2.4-16, 17). */
export async function setChallengeLeaderboard(input: { challengeId: string; show: boolean; alias: string | null }): Promise<{ ok: boolean }> {
  const alias = cleanAlias(input.alias);
  if (!isId(input.challengeId) || typeof input.show !== "boolean" || alias === undefined) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_challenge_leaderboard", { p_challenge_id: input.challengeId, p_show: input.show, p_alias: alias ?? undefined });
  if (error) {
    console.error("saving the leaderboard choice failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}

/** The participant leaves a challenge. */
export async function leaveChallenge(challengeId: unknown): Promise<{ ok: boolean }> {
  if (!isId(challengeId)) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("leave_challenge", { p_challenge_id: challengeId });
  if (error) {
    console.error("leaving a challenge failed", error.code);
    return { ok: false };
  }
  refresh();
  return { ok: true };
}
