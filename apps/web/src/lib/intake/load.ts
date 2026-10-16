import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { changedSections, readIntake } from "./form";

export type IntakeVersion = ReturnType<typeof readIntake> & { submittedAt: string; parqFlagged: boolean };

type Person = { first_name: string | null; last_name: string | null; display_name: string | null } | null;

/** The name a person goes by in the app, empty when they have none. */
function nameOf(person: Person): string {
  if (!person) return "";
  return person.display_name?.trim() || [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
}

/** Without a session the pages ask to sign in instead of answering "not found". */
export const SIGNED_OUT = "signed-out";

/** The pair and the signed-in user, SIGNED_OUT, or null when the id is not a pair this user sees. */
async function pairFor(coachingId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) return SIGNED_OUT;
  if (!z.uuid().safeParse(coachingId).success) return null;
  const [{ data: pair, error }, { data: settings }] = await Promise.all([
    supabase.from("coachings").select("id, trainer_id, client_id, status").eq("id", coachingId).maybeSingle(),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair) return null;
  return { supabase, userId, pair, timeZone: settings?.time_zone ?? undefined };
}

const VERSION_COLUMNS = "answers, parq_answers, parq_flagged, submitted_at";

type VersionRow = { answers: unknown; parq_answers: unknown; parq_flagged: boolean; submitted_at: string };

const toVersion = (row: VersionRow): IntakeVersion => ({
  ...readIntake(row.answers, row.parq_answers),
  submittedAt: row.submitted_at,
  parqFlagged: row.parq_flagged,
});

/** The client's side of one pair: the trainer's name, whether they see the intake, and the latest version. */
export type ClientIntake = {
  coachingId: string;
  live: boolean;
  timeZone: string | undefined;
  trainerName: string;
  shared: boolean;
  decided: boolean;
  latest: IntakeVersion | null;
};

export async function loadClientIntake(coachingId: string): Promise<ClientIntake | typeof SIGNED_OUT | null> {
  const found = await pairFor(coachingId);
  if (found === SIGNED_OUT) return found;
  if (!found || found.pair.client_id !== found.userId) return null;
  const { supabase, userId, pair, timeZone } = found;
  const [share, trainer, latest] = await Promise.all([
    supabase.from("data_shares").select("intake, intake_decided_at").eq("coaching_id", pair.id).maybeSingle(),
    supabase.from("profiles").select("first_name, last_name, display_name").eq("id", pair.trainer_id).maybeSingle(),
    supabase.from("intakes").select(VERSION_COLUMNS).eq("user_id", userId).order("submitted_at", { ascending: false }).limit(1),
  ]);
  for (const [what, result] of Object.entries({ share, trainer, latest })) {
    if (result.error) throw new Error(`loading the ${what} failed: ${result.error.code}`);
  }
  return {
    coachingId: pair.id,
    live: pair.status !== "ended",
    timeZone,
    trainerName: nameOf(trainer.data),
    shared: Boolean(share.data?.intake),
    decided: Boolean(share.data?.intake_decided_at),
    latest: latest.data?.[0] ? toVersion(latest.data[0]) : null,
  };
}

/**
 * The trainer's side (screens.md "↳ Анкета"): hidden when the client does not show it (or the pair ended),
 * empty before the first version, otherwise the latest version with the sections changed since the trainer
 * last opened it.
 */
export type TrainerIntake =
  | { state: "hidden"; coachingId: string; live: boolean }
  | { state: "empty"; coachingId: string }
  | {
      state: "filled";
      coachingId: string;
      timeZone: string | undefined;
      first: string;
      latest: IntakeVersion;
      changed: Set<string>;
    };

export async function loadTrainerIntake(coachingId: string): Promise<TrainerIntake | typeof SIGNED_OUT | null> {
  const found = await pairFor(coachingId);
  if (found === SIGNED_OUT) return found;
  if (!found || found.pair.trainer_id !== found.userId) return null;
  const { supabase, pair, timeZone } = found;
  const live = pair.status !== "ended";
  const [share, meta] = await Promise.all([
    supabase.from("data_shares").select("intake").eq("coaching_id", pair.id).maybeSingle(),
    supabase.from("coaching_trainer_meta").select("intake_seen_at").eq("coaching_id", pair.id).maybeSingle(),
  ]);
  if (share.error) throw new Error(`loading the share failed: ${share.error.code}`);
  if (meta.error) throw new Error(`loading the pair meta failed: ${meta.error.code}`);
  if (!live || !share.data?.intake) return { state: "hidden", coachingId: pair.id, live };

  // RLS returns versions only while the client shows them to this trainer (can_view).
  const { data: rows, error } = await supabase
    .from("intakes")
    .select(VERSION_COLUMNS)
    .eq("user_id", pair.client_id)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(`loading the intake failed: ${error.code}`);
  if (!rows.length) return { state: "empty", coachingId: pair.id };

  const latest = toVersion(rows[0]);
  const seenAt = meta.data?.intake_seen_at ?? null;
  // What the trainer last saw: the newest version at or before that moment. Nothing is marked before the first look.
  const seen = seenAt ? rows.find((row) => Date.parse(row.submitted_at) <= Date.parse(seenAt)) : undefined;
  const changed = seen && seen !== rows[0] ? changedSections(toVersion(seen), latest) : new Set<string>();
  return { state: "filled", coachingId: pair.id, timeZone, first: rows[rows.length - 1].submitted_at, latest, changed };
}
