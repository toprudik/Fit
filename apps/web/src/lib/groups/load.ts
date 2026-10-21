import "server-only";
import { displayName } from "@/lib/pairs/clients";
import { PAID_PLAN, requestedPlans } from "@/lib/plans/plans";
import { clientNames, loadScheduleOwner } from "@/lib/schedule/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/nutrition/target";

type Owner = NonNullable<Awaited<ReturnType<typeof loadScheduleOwner>>>;

function fail(what: string, error: { code?: string }): never {
  throw new Error(`loading the ${what} failed: ${error.code}`);
}

/** Groups and broadcasts are Pro (PRD wave-2 §6, Q56). */
export type GroupsAccess = { groups: boolean; broadcasts: boolean; requested: boolean };

async function loadAccess(owner: Owner): Promise<GroupsAccess> {
  const ask = (feature: string) => owner.supabase.rpc("has_entitlement", { p_user: owner.userId, p_feature: feature });
  const [groups, broadcasts, requests] = await Promise.all([
    ask("trainer.groups"),
    ask("trainer.broadcasts"),
    owner.supabase.from("access_requests").select("plan_code, status, created_at").eq("user_id", owner.userId),
  ]);
  if (groups.error) fail("plan", groups.error);
  if (broadcasts.error) fail("plan", broadcasts.error);
  if (requests.error) fail("access requests", requests.error);
  return {
    groups: groups.data === true,
    broadcasts: broadcasts.data === true,
    requested: requestedPlans(requests.data).has(PAID_PLAN.trainer),
  };
}

export type Template = {
  kcal: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  waterMl: number | null;
  steps: number | null;
};

export type GroupSummary = { id: string; name: string; goal: Goal | null; color: string | null; members: number; template: number | null };

/** «Группы»: the trainer's live groups with their size and template kcal. Null when signed out. */
export async function loadGroups(): Promise<{ access: GroupsAccess; groups: GroupSummary[] } | null> {
  const owner = await loadScheduleOwner();
  if (!owner) return null;
  const [access, groups, members, templates] = await Promise.all([
    loadAccess(owner),
    owner.supabase.from("groups").select("id, name, goal, color").eq("trainer_id", owner.userId).is("archived_at", null).order("created_at"),
    owner.supabase.from("group_members").select("group_id, coachings!inner(status)").in("coachings.status", ["trial", "active"]),
    owner.supabase.from("nutrition_targets").select("group_id, kcal").eq("source", "group").is("effective_to", null),
  ]);
  if (groups.error) fail("groups", groups.error);
  if (members.error) fail("group members", members.error);
  if (templates.error) fail("group templates", templates.error);
  const count = new Map<string, number>();
  for (const row of members.data) count.set(row.group_id, (count.get(row.group_id) ?? 0) + 1);
  const kcal = new Map(templates.data.map((row) => [row.group_id, row.kcal]));
  return {
    access,
    groups: groups.data.map((group) => ({
      ...group,
      members: count.get(group.id) ?? 0,
      template: kcal.get(group.id) ?? null,
    })),
  };
}

export type GroupMember = {
  coachingId: string;
  name: string;
  /** Visible only while the client shares nutrition. */
  goal: Goal | null;
  /** The pair takes this group's template (its primary nutrition group). */
  primary: boolean;
  /** The pair sits in other groups of the trainer that have a template. */
  otherTemplateGroups: number;
  /** The client has not given the health data consent, so their goal and numbers stay out of the group. */
  noHealthConsent: boolean;
};

export type BroadcastRow = {
  id: string;
  createdAt: string;
  body: string;
  buttonKind: "deep_link" | "url" | null;
  buttonUrl: string | null;
  recipients: number;
  sent: number;
  deferred: number;
  undelivered: number;
  muted: number;
};

export type GroupDetails = {
  access: GroupsAccess;
  timeZone: string;
  group: { id: string; name: string; goal: Goal | null; description: string | null; color: string | null };
  members: GroupMember[];
  /** Live pairs of the trainer not in the group yet, with whether another group gives them a template. */
  candidates: { coachingId: string; name: string; goal: Goal | null; hasTemplateGroup: boolean }[];
  template: Template | null;
  /** Members who would get the template today. */
  impact: number;
  analytics: {
    members: number;
    attendance: number | null;
    attendanceClients: number;
    weightChangeKg: number | null;
    weightClients: number;
    /** Average adherence over 30 full days, in %; null under three judged clients (§6 rule 8). */
    adherence: number | null;
    adherenceClients: number;
  };
  broadcasts: BroadcastRow[];
  broadcastsToday: number;
};

/** One group of the trainer for /trainer/groups/[groupId]; null when signed out or not theirs. */
export async function loadGroup(groupId: string): Promise<GroupDetails | null> {
  const owner = await loadScheduleOwner();
  if (!owner) return null;
  const { supabase, userId } = owner;
  const { data: group, error } = await supabase
    .from("groups")
    .select("id, name, goal, description, color")
    .eq("id", groupId)
    .eq("trainer_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) fail("group", error);
  if (!group) return null;

  const [access, pairs, memberships, templates, impact, analytics, history, today, noConsent] = await Promise.all([
    loadAccess(owner),
    supabase.from("coachings").select("id, client_id, primary_nutrition_group_id").eq("trainer_id", userId).in("status", ["trial", "active"]),
    supabase.from("group_members").select("group_id, coaching_id, groups!inner(archived_at, trainer_id)").eq("groups.trainer_id", userId).is("groups.archived_at", null),
    supabase.from("nutrition_targets").select("group_id, kcal, protein_g, fat_g, carbs_g, water_ml, steps_target").eq("source", "group").is("effective_to", null),
    supabase.rpc("group_target_impact", { p_group_id: groupId }),
    supabase.rpc("group_analytics", { p_group_id: groupId }).single(),
    supabase.rpc("broadcast_history", { p_group_id: groupId }),
    supabase.rpc("broadcasts_today"),
    supabase.rpc("my_clients_without_health_consent"),
  ]);
  if (pairs.error) fail("pairs", pairs.error);
  if (memberships.error) fail("memberships", memberships.error);
  if (templates.error) fail("group templates", templates.error);
  if (impact.error) fail("template impact", impact.error);
  if (analytics.error) fail("group analytics", analytics.error);
  if (history.error) fail("broadcasts", history.error);
  if (today.error) fail("broadcast count", today.error);
  if (noConsent.error) fail("health consents", noConsent.error);
  const withoutConsent = new Set(noConsent.data);

  const withTemplate = new Set(templates.data.map((row) => row.group_id));
  const ids = pairs.data.map((pair) => pair.id);
  const [names, goals] = await Promise.all([
    clientNames(supabase, ids),
    supabase
      .from("client_goals")
      .select("user_id, goal, set_at")
      .in(
        "user_id",
        pairs.data.map((pair) => pair.client_id),
      )
      .order("set_at", { ascending: false }),
  ]);
  if (goals.error) fail("goals", goals.error);
  const goalOf = new Map<string, Goal>();
  for (const row of goals.data) if (!goalOf.has(row.user_id)) goalOf.set(row.user_id, row.goal);

  const inGroup = new Set(memberships.data.filter((row) => row.group_id === groupId).map((row) => row.coaching_id));
  const otherTemplates = (coachingId: string) =>
    memberships.data.filter((row) => row.coaching_id === coachingId && row.group_id !== groupId && withTemplate.has(row.group_id)).length;
  const template = templates.data.find((row) => row.group_id === groupId);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  return {
    access,
    timeZone: owner.timeZone,
    group,
    members: pairs.data
      .filter((pair) => inGroup.has(pair.id))
      .map((pair) => ({
        coachingId: pair.id,
        name: names.get(pair.id) ?? displayName(undefined),
        goal: goalOf.get(pair.client_id) ?? null,
        primary: pair.primary_nutrition_group_id === groupId,
        otherTemplateGroups: otherTemplates(pair.id),
        noHealthConsent: withoutConsent.has(pair.id),
      }))
      .sort(byName),
    candidates: pairs.data
      .filter((pair) => !inGroup.has(pair.id))
      .map((pair) => ({
        coachingId: pair.id,
        name: names.get(pair.id) ?? displayName(undefined),
        goal: goalOf.get(pair.client_id) ?? null,
        hasTemplateGroup: otherTemplates(pair.id) > 0,
      }))
      .sort(byName),
    template: template
      ? {
          kcal: template.kcal,
          proteinG: template.protein_g,
          fatG: template.fat_g,
          carbsG: template.carbs_g,
          waterMl: template.water_ml,
          steps: template.steps_target,
        }
      : null,
    impact: impact.data,
    analytics: {
      members: analytics.data.members,
      attendance: analytics.data.attendance,
      attendanceClients: analytics.data.attendance_clients,
      weightChangeKg: analytics.data.weight_change_kg,
      weightClients: analytics.data.weight_clients,
      adherence: analytics.data.adherence,
      adherenceClients: analytics.data.adherence_clients,
    },
    broadcasts: history.data.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      body: row.body,
      buttonKind: row.button_kind === "deep_link" || row.button_kind === "url" ? row.button_kind : null,
      buttonUrl: row.button_url,
      recipients: row.recipients,
      sent: row.sent,
      deferred: row.deferred,
      undelivered: row.undelivered,
      muted: row.muted,
    })),
    broadcastsToday: today.data,
  };
}

export type MyGroup = { groupId: string; coachingId: string; trainerName: string; name: string; goal: Goal | null; color: string | null; muted: boolean };

/** The client's groups (names and goals only, §6 rule 7) with whether each trainer's broadcasts are off. */
export async function loadMyGroups(): Promise<MyGroup[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_groups");
  if (error) fail("my groups", error);
  return data.map((row) => ({
    groupId: row.group_id,
    coachingId: row.coaching_id,
    trainerName: row.trainer_name,
    name: row.name,
    goal: row.goal,
    color: row.color,
    muted: row.broadcasts_muted,
  }));
}
