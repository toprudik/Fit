import "server-only";
import { z } from "zod";
import { todayIn } from "@/lib/passes/present";
import { loadTrainerShares } from "@/lib/sharing/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PHOTO_ANGLES, PHOTO_BUCKET, SIGNED_URL_TTL, type PhotoAngle, type PhotoSet } from "./photos";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const PHOTO_LIMIT = 90;

type Row = { id: string; angle: PhotoAngle; taken_on: string; storage_path: string; width: number; height: number };

/**
 * Photo sets of a client, newest date first, each photo with a link that lives five minutes (PRD 2.11-5).
 * Links are signed as the viewer, so Storage checks the viewer may read each object (PROG-5): a trainer
 * without the photos share gets no rows and no links.
 */
async function photoSets(supabase: Supabase, clientId: string): Promise<PhotoSet[]> {
  const { data, error } = await supabase
    .from("progress_photos")
    .select("id, angle, taken_on, storage_path, width, height")
    .eq("client_id", clientId)
    .order("taken_on", { ascending: false })
    .limit(PHOTO_LIMIT);
  if (error) throw new Error(`loading progress photos failed: ${error.code}`);
  const rows = data as Row[];
  if (!rows.length) return [];
  const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(
    rows.map((row) => row.storage_path),
    SIGNED_URL_TTL,
  );
  if (signed.error) throw new Error(`signing progress photo links failed: ${signed.error.name}`);
  const urls = new Map(signed.data.map((item) => [item.path, item.signedUrl]));
  const sets = new Map<string, PhotoSet>();
  for (const row of rows) {
    const url = urls.get(row.storage_path);
    if (!url) continue;
    const set = sets.get(row.taken_on) ?? { date: row.taken_on, photos: {} };
    set.photos[row.angle] = { id: row.id, url, width: row.width, height: row.height };
    sets.set(row.taken_on, set);
  }
  return [...sets.values()];
}

export type MyPhotos = {
  sets: PhotoSet[];
  today: string;
  /** Trainers of live pairs who see the photos: the gallery says so (screens.md). */
  viewers: string[];
};

type Person = { first_name: string | null; last_name: string | null; display_name: string | null } | null;

function nameOf(person: Person): string {
  if (!person) return "";
  return person.display_name?.trim() || [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
}

export async function loadMyPhotos(): Promise<MyPhotos | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const [settings, sets, pairs] = await Promise.all([
    supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle(),
    photoSets(supabase, me),
    supabase.from("coachings").select("id, trainer_id").eq("client_id", me).neq("status", "ended"),
  ]);
  if (pairs.error) throw new Error(`loading pairs failed: ${pairs.error.code}`);
  let viewers: string[] = [];
  if (pairs.data.length) {
    const { data: shares } = await supabase
      .from("data_shares")
      .select("coaching_id, photos")
      .in(
        "coaching_id",
        pairs.data.map((pair) => pair.id),
      );
    const open = new Set((shares ?? []).filter((share) => share.photos).map((share) => share.coaching_id));
    const trainerIds = pairs.data.filter((pair) => open.has(pair.id)).map((pair) => pair.trainer_id);
    if (trainerIds.length) {
      const { data: people } = await supabase.from("profiles").select("first_name, last_name, display_name").in("id", trainerIds);
      viewers = (people ?? []).map(nameOf).filter(Boolean);
      if (viewers.length < trainerIds.length) viewers = [...viewers, ...Array(trainerIds.length - viewers.length).fill("")];
    }
  }
  return { sets, today: todayIn(settings.data?.time_zone ?? "Europe/Moscow"), viewers };
}

export type PairPhotos = { state: "open"; sets: PhotoSet[]; today: string } | { state: "closed" };

/** The client's photos on the trainer's card, only while the client shares photos with this trainer (Q38). */
export async function loadPairPhotos(coachingId: string): Promise<PairPhotos | null> {
  if (!z.uuid().safeParse(coachingId).success) return null;
  const shares = await loadTrainerShares(coachingId);
  if (!shares) return null;
  if (!shares.photos) return { state: "closed" };
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const [{ data: pair, error }, settings] = await Promise.all([
    supabase.from("coachings").select("client_id").eq("id", coachingId).maybeSingle(),
    supabase.from("user_settings").select("time_zone").eq("user_id", session?.claims.sub ?? "").maybeSingle(),
  ]);
  if (error) throw new Error(`loading the pair failed: ${error.code}`);
  if (!pair) return null;
  return { state: "open", sets: await photoSets(supabase, pair.client_id), today: todayIn(settings.data?.time_zone ?? "Europe/Moscow") };
}

/** Dates that have a photo of each angle, newest first: the choices of "До и после" (PROG-7). */
export function datesByAngle(sets: PhotoSet[]): Record<PhotoAngle, string[]> {
  return Object.fromEntries(PHOTO_ANGLES.map((angle) => [angle, sets.filter((set) => set.photos[angle]).map((set) => set.date)])) as Record<
    PhotoAngle,
    string[]
  >;
}
