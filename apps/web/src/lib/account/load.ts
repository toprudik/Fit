import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { EXPORT_BUCKET, EXPORT_URL_TTL } from "./export";

type ExportStatus = Database["public"]["Enums"]["export_status"];

const DEFAULT_TIME_ZONE = "Europe/Moscow";

type Person = { first_name: string | null; last_name: string | null; display_name: string | null };

function nameOf(person: Person): string {
  return person.display_name?.trim() || [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
}

export type Deletion = {
  /** The deletion date while a request is pending. */
  scheduledFor: string | null;
  trainer: boolean;
  /** Trainers of the user's live pairs, by name: they get a message. */
  trainers: string[];
  /** Upcoming bookings on either side that the request cancels. */
  upcoming: number;
  timeZone: string;
};

/** What the deletion screen needs, read as the user under RLS. Null when signed out. */
export async function loadDeletion(): Promise<Deletion | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const [deletion, trainer, pairs, upcoming, settings] = await Promise.all([
    supabase.from("account_deletions").select("scheduled_for").eq("user_id", me).is("cancelled_at", null).maybeSingle(),
    supabase.from("trainer_profiles").select("user_id").eq("user_id", me).maybeSingle(),
    supabase.from("coachings").select("trainer_id").eq("client_id", me).neq("status", "ended"),
    supabase
      .from("bookings")
      .select("id, sessions!inner(starts_at)", { count: "exact", head: true })
      .or(`client_id.eq.${me},trainer_id.eq.${me}`)
      .in("status", ["requested", "confirmed"])
      .gt("sessions.starts_at", new Date().toISOString()),
    supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle(),
  ]);
  if (deletion.error) throw new Error(`loading the deletion failed: ${deletion.error.code}`);
  if (pairs.error) throw new Error(`loading pairs failed: ${pairs.error.code}`);
  let trainers: string[] = [];
  if (pairs.data.length) {
    const { data: people } = await supabase
      .from("profiles")
      .select("first_name, last_name, display_name")
      .in(
        "id",
        pairs.data.map((pair) => pair.trainer_id),
      );
    trainers = (people ?? []).map(nameOf).filter(Boolean);
  }
  return {
    scheduledFor: deletion.data?.scheduled_for ?? null,
    trainer: trainer.data !== null,
    trainers,
    upcoming: upcoming.count ?? 0,
    timeZone: settings.data?.time_zone ?? DEFAULT_TIME_ZONE,
  };
}

export type ExportRow = {
  id: string;
  status: ExportStatus;
  requestedAt: string;
  expiresAt: string | null;
  /** Download links of a ready archive, one per part, signed for EXPORT_URL_TTL. */
  parts: string[];
};

const HISTORY = 10;

/** The user's export requests, newest first, with fresh links for a ready archive. Null when signed out. */
export async function loadExports(): Promise<{ rows: ExportRow[]; timeZone: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const [exports, settings] = await Promise.all([
    supabase
      .from("data_exports")
      .select("id, status, storage_path, requested_at, expires_at")
      .eq("user_id", me)
      .order("requested_at", { ascending: false })
      .limit(HISTORY),
    supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle(),
  ]);
  if (exports.error) throw new Error(`loading exports failed: ${exports.error.code}`);
  const now = Date.now();
  const rows = await Promise.all(
    exports.data.map(async (row): Promise<ExportRow> => {
      const live = row.status === "ready" && row.storage_path && row.expires_at && new Date(row.expires_at).getTime() > now;
      const base = { id: row.id, requestedAt: row.requested_at, expiresAt: row.expires_at };
      if (!live || !row.storage_path) return { ...base, status: row.status === "ready" && !live ? "expired" : row.status, parts: [] };
      const bucket = supabase.storage.from(EXPORT_BUCKET);
      const { data: files, error } = await bucket.list(row.storage_path, { sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`listing the export failed: ${error.name}`);
      const names = files
        .filter((file) => file.id && /^part-\d+\.zip$/.test(file.name))
        .map((file) => file.name)
        .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
      const parts = await Promise.all(
        names.map(async (name, index) => {
          const { data, error: signError } = await bucket.createSignedUrl(`${row.storage_path}/${name}`, EXPORT_URL_TTL, {
            download: names.length > 1 ? `dafit-export-${index + 1}.zip` : "dafit-export.zip",
          });
          if (signError) throw new Error(`signing the export failed: ${signError.name}`);
          return data.signedUrl;
        }),
      );
      return { ...base, status: row.status, parts };
    }),
  );
  return { rows, timeZone: settings.data?.time_zone ?? DEFAULT_TIME_ZONE };
}
