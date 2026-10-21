"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { monthStart, SEASON_TITLE_MAX, SEASON_TITLE_MIN } from "./season";

const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;

/** «Участвовать» and «Выйти» on the client's season challenge card, until the month is over. */
export async function setSeasonChallengeJoined(id: string, joined: boolean): Promise<{ ok: true } | { ok: false; reason: "closed" | "failed" }> {
  if (!isId(id) || typeof joined !== "boolean") return { ok: false, reason: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_season_challenge_joined", { p_id: id, p_joined: joined });
  if (!error) {
    refresh();
    return { ok: true };
  }
  if (error.message === "challenge_closed") {
    refresh();
    return { ok: false, reason: "closed" };
  }
  console.error("joining the season challenge failed", error.code);
  return { ok: false, reason: "failed" };
}

export type CreateSeasonResult = { status: "done" | "invalid-title" | "invalid-month" | "month-taken" | "failed" };

/** «Запустить» in /admin/season-challenges: admin_create_season_challenge checks the admin and audits it. */
export async function createSeasonChallenge(raw: { title: string; month: string }): Promise<CreateSeasonResult> {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title.length < SEASON_TITLE_MIN || title.length > SEASON_TITLE_MAX) return { status: "invalid-title" };
  const month = monthStart(raw.month);
  if (!month) return { status: "invalid-month" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_create_season_challenge", { p_title: title, p_month: month });
  if (!error) {
    refresh();
    return { status: "done" };
  }
  if (error.message === "invalid_title") return { status: "invalid-title" };
  if (error.message === "invalid_month") return { status: "invalid-month" };
  if (error.message === "month_taken") return { status: "month-taken" };
  console.error("starting a season challenge failed", error.code);
  return { status: "failed" };
}

/** «Отменить» a season challenge that has not finished; "already" when it was cancelled a moment ago, by this admin or another. */
export async function cancelSeasonChallenge(id: string): Promise<{ status: "done" | "already" | "failed" }> {
  if (!isId(id)) return { status: "failed" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("admin_cancel_season_challenge", { p_id: id });
  refresh();
  if (!error) return { status: "done" };
  if (error.message === "already_cancelled") return { status: "already" };
  if (error.message !== "challenge_not_found") console.error("cancelling a season challenge failed", error.code);
  return { status: "failed" };
}
