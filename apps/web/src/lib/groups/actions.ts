"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { isGoal, KCAL_MAX, KCAL_MIN } from "@/lib/nutrition/target";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, isGroupColor, parseBroadcast, type BroadcastButton } from "./rules";

export type GroupActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? unknown : { value: T }))
  | { ok: false; reason: "invalid" | "failed" | "plan" | "limit" | "empty" | "primary" | "low" };

const isId = (value: unknown): value is string => z.uuid().safeParse(value).success;

function failed(what: string, error: { code: string; message?: string }): { ok: false; reason: "failed" | "plan" } {
  if (error.code === "42501" && error.message === "plan_required") return { ok: false, reason: "plan" };
  console.error(`${what} failed`, error.code);
  return { ok: false, reason: "failed" };
}

export type GroupInput = { name: string; goal: string | null; description: string | null; color: string | null };

function parseGroup(input: GroupInput) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!name || name.length > GROUP_NAME_MAX || description.length > GROUP_DESCRIPTION_MAX) return null;
  if (input.goal !== null && !isGoal(input.goal)) return null;
  if (input.color !== null && !isGroupColor(input.color)) return null;
  return { name, goal: input.goal, description: description || null, color: input.color };
}

/** "Новая группа" from a template or empty (PRD wave-2 §6 rules 2–3). Returns the new group's id. */
export async function createGroup(input: GroupInput): Promise<GroupActionResult<string>> {
  const values = parseGroup(input);
  if (!values) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return { ok: false, reason: "failed" };
  const { data, error } = await supabase
    .from("groups")
    .insert({ trainer_id: session.claims.sub, ...values })
    .select("id")
    .single();
  // The insert policy checks trainer.groups, so a plan without it reads as a policy violation.
  if (error) return error.code === "42501" ? { ok: false, reason: "plan" } : failed("creating a group", error);
  refresh();
  return { ok: true, value: data.id };
}

/** Rename, goal, colour and description of a group. */
export async function updateGroup(groupId: unknown, input: GroupInput): Promise<GroupActionResult> {
  const values = parseGroup(input);
  if (!isId(groupId) || !values) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("groups").update(values).eq("id", groupId);
  if (error) return failed("updating a group", error);
  refresh();
  return { ok: true };
}

/** "Удалить группу": archived, so past broadcasts and templates keep their group (data-model soft delete). */
export async function archiveGroup(groupId: unknown): Promise<GroupActionResult> {
  if (!isId(groupId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("groups").update({ archived_at: new Date().toISOString() }).eq("id", groupId);
  if (error) return failed("archiving a group", error);
  refresh();
  return { ok: true };
}

/**
 * Adds a pair to the group. `makePrimary` answers which group gives the template when the pair is already in
 * another group with one (§6.3); without it such a pair comes back as "primary". The value is the goal warning
 * of §6.2 (the client's goal differs from the group's).
 */
export async function addGroupMember(groupId: unknown, coachingId: unknown, makePrimary?: boolean): Promise<GroupActionResult<boolean>> {
  if (!isId(groupId) || !isId(coachingId) || (makePrimary !== undefined && typeof makePrimary !== "boolean")) {
    return { ok: false, reason: "invalid" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_group_member", {
    p_group_id: groupId,
    p_coaching_id: coachingId,
    p_make_primary: makePrimary,
  });
  if (error?.message === "primary_choice_required") return { ok: false, reason: "primary" };
  if (error) return failed("adding a group member", error);
  refresh();
  return { ok: true, value: data === true };
}

/** Takes a pair out of the group; its template falls back to another group or the next source. */
export async function removeGroupMember(groupId: unknown, coachingId: unknown): Promise<GroupActionResult> {
  if (!isId(groupId) || !isId(coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("coaching_id", coachingId);
  if (error) return failed("removing a group member", error);
  refresh();
  return { ok: true };
}

/** "Сделать основной по питанию" for a member in several groups with a template (§6.4). */
export async function makePrimaryGroup(groupId: unknown, coachingId: unknown): Promise<GroupActionResult> {
  if (!isId(groupId) || !isId(coachingId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_primary_nutrition_group", { p_coaching_id: coachingId, p_group_id: groupId });
  if (error) return failed("setting the primary group", error);
  refresh();
  return { ok: true };
}

export type TemplateInput = {
  groupId: string;
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  waterMl: number | null;
  steps: number | null;
  confirmLow: boolean;
};

const whole = (value: unknown, max: number) => value === null || (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max);

/** "Шаблон нормы" of a group from today (§6 rule 6); under 1200 kcal it asks for a confirmation first. */
export async function setGroupTarget(input: TemplateInput): Promise<GroupActionResult> {
  const valid =
    isId(input.groupId) &&
    Number.isInteger(input.kcal) &&
    input.kcal >= KCAL_MIN &&
    input.kcal <= KCAL_MAX &&
    whole(input.proteinG, 1000) &&
    whole(input.fatG, 1000) &&
    whole(input.carbsG, 2000) &&
    whole(input.waterMl, 10000) &&
    whole(input.steps, 100000) &&
    typeof input.confirmLow === "boolean";
  if (!valid) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_group_target", {
    p_group_id: input.groupId,
    p_kcal: input.kcal,
    p_protein_g: input.proteinG ?? undefined,
    p_fat_g: input.fatG ?? undefined,
    p_carbs_g: input.carbsG ?? undefined,
    p_water_ml: input.waterMl ?? undefined,
    p_steps_target: input.steps ?? undefined,
    p_confirm_low: input.confirmLow,
  });
  if (error?.message === "low_kcal_unconfirmed") return { ok: false, reason: "low" };
  if (error) return failed("setting the group target", error);
  refresh();
  return { ok: true };
}

/** "Убрать шаблон": members fall back to the next source from today. */
export async function clearGroupTarget(groupId: unknown): Promise<GroupActionResult> {
  if (!isId(groupId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("clear_group_target", { p_group_id: groupId });
  if (error) return failed("clearing the group target", error);
  refresh();
  return { ok: true };
}

/** "Отправить" a broadcast to every member through the bot (§6.9). */
export async function sendBroadcast(groupId: unknown, body: unknown, button: BroadcastButton): Promise<GroupActionResult> {
  if (!isId(groupId) || typeof body !== "string" || !button || !["none", "deep_link", "url"].includes(button.kind)) {
    return { ok: false, reason: "invalid" };
  }
  const parsed = parseBroadcast(body, button);
  if ("error" in parsed) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("send_broadcast", {
    p_group_id: groupId,
    p_body: parsed.body,
    p_button_kind: parsed.button.kind === "none" ? undefined : parsed.button.kind,
    p_button_url: parsed.button.kind === "url" ? parsed.button.url : undefined,
  });
  if (error?.message === "broadcast_limit") return { ok: false, reason: "limit" };
  if (error?.message === "group_empty") return { ok: false, reason: "empty" };
  if (error) return failed("sending a broadcast", error);
  refresh();
  return { ok: true };
}

/** "Удалить из истории": the sent message stays with the clients (§6.9, assumption). */
export async function deleteBroadcast(broadcastId: unknown): Promise<GroupActionResult> {
  if (!isId(broadcastId)) return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("broadcasts").update({ deleted_at: new Date().toISOString() }).eq("id", broadcastId);
  if (error) return failed("deleting a broadcast", error);
  refresh();
  return { ok: true };
}

/** The client turns one trainer's broadcasts off or on (§6.9). */
export async function setBroadcastsMuted(coachingId: unknown, muted: unknown): Promise<GroupActionResult> {
  if (!isId(coachingId) || typeof muted !== "boolean") return { ok: false, reason: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_broadcasts_muted", { p_coaching_id: coachingId, p_muted: muted });
  if (error) return failed("muting broadcasts", error);
  refresh();
  return { ok: true };
}
