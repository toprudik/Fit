import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import { dictionaries } from "@/i18n/dictionaries";
import { PHOTO_BUCKET } from "@/lib/progress/photos";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { zip, type ZipEntry } from "./zip";

/**
 * The data export (PRD wave-1 §2.12-6, PRIV-6): everything the user has in DaFit in every role, as JSON and CSV
 * per table plus the progress photos, zipped into bucket exports at {user}/{export}/part-N.zip. The privacy
 * route builds it with the secret key: a cron run has no user session, and a trainer's rows span many tables.
 * Nothing here reaches anyone but the owner: the files sit in the owner's folder, which only they can read.
 */

export const EXPORT_BUCKET = "exports";
/** A part stays under the bucket's 50 MB limit; a long photo history splits into several parts. */
export const PART_LIMIT = 45 * 1024 * 1024;
/** Links on the export screen live this long; the screen signs new ones on every visit. */
export const EXPORT_URL_TTL = 15 * 60;

type Admin = ReturnType<typeof createSupabaseAdminClient>;
/** Rows of many tables read the same way, so the export reads them untyped. */
type Db = SupabaseClient;
type Row = Record<string, unknown>;
type Query = ReturnType<ReturnType<Db["from"]>["select"]>;

const PAGE = 1000;
const CHUNK = 100;

/** Every row of a query, page by page: PostgREST returns at most 1000 at a time. */
async function all(db: Db, table: string, build: (query: Query) => Query): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(db.from(table).select("*")).range(from, from + PAGE - 1);
    if (error) throw new Error(`export: reading ${table} failed: ${error.code}`);
    rows.push(...(data as Row[]));
    if (data.length < PAGE) return rows;
  }
}

/** Rows whose `column` is one of `ids`, in chunks so the URL stays short. */
async function byIds(db: Db, table: string, column: string, ids: string[]): Promise<Row[]> {
  const rows: Row[] = [];
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += CHUNK) {
    rows.push(...(await all(db, table, (query) => query.in(column, unique.slice(index, index + CHUNK)))));
  }
  return rows;
}

const ids = (rows: Row[], column = "id") => rows.map((row) => row[column]).filter((value): value is string => typeof value === "string");

function merge(...lists: Row[][]): Row[] {
  const seen = new Map<unknown, Row>();
  for (const row of lists.flat()) seen.set(row.id ?? JSON.stringify(row), row);
  return [...seen.values()];
}

/** The user's tables, by file name. Secrets (calendar feed tokens) and delivery logs stay out. */
export async function collectExport(admin: Admin, userId: string): Promise<Record<string, Row[]>> {
  const db = admin as unknown as Db;
  const mine = (table: string, column: string) => all(db, table, (query) => query.eq(column, userId));
  const either = (table: string, a: string, b: string) => all(db, table, (query) => query.or(`${a}.eq.${userId},${b}.eq.${userId}`));

  const [profile, settings, preferences, consents, roles, plans, accessRequests, intakes, measurements, photos, records, logs, feedback, contacts] =
    await Promise.all([
      mine("profiles", "id"),
      mine("user_settings", "user_id"),
      mine("notification_preferences", "user_id"),
      mine("consents", "user_id"),
      mine("user_roles", "user_id"),
      mine("plan_grants", "user_id"),
      mine("access_requests", "user_id"),
      mine("intakes", "user_id"),
      mine("measurements", "client_id"),
      mine("progress_photos", "client_id"),
      mine("personal_records", "client_id"),
      mine("workout_logs", "client_id"),
      mine("feedback", "user_id"),
      either("contact_requests", "requester_id", "recipient_id"),
    ]);

  const [pairs, bookings, trainerSessions, passes, payments, ledger, moneyEvents] = await Promise.all([
    either("coachings", "client_id", "trainer_id"),
    either("bookings", "client_id", "trainer_id"),
    mine("sessions", "trainer_id"),
    either("passes", "client_id", "trainer_id"),
    either("payments", "client_id", "trainer_id"),
    either("ledger_entries", "client_id", "trainer_id"),
    either("money_events", "client_id", "trainer_id"),
  ]);
  const asTrainer = pairs.filter((pair) => pair.trainer_id === userId);
  const asClient = pairs.filter((pair) => pair.client_id === userId);
  const partners = [...new Set(pairs.map((pair) => (pair.trainer_id === userId ? pair.client_id : pair.trainer_id)))].filter(
    (id): id is string => typeof id === "string",
  );

  const [
    clientSessions,
    bookingEvents,
    freezes,
    shares,
    trainerNotes,
    clientNotes,
    trainerMeta,
    milestones,
    logExercises,
    people,
    trainer,
    certificates,
    verifications,
    invites,
    trialLinks,
    locations,
    weekTemplates,
    slots,
    recurrences,
    packages,
    paymentLinks,
    templates,
    exercises,
  ] = await Promise.all([
    byIds(db, "sessions", "id", ids(bookings, "session_id")),
    byIds(db, "booking_events", "booking_id", ids(bookings)),
    byIds(db, "pass_freezes", "pass_id", ids(passes)),
    byIds(db, "data_shares", "coaching_id", ids(asClient)),
    byIds(db, "coaching_notes", "coaching_id", ids(asTrainer)),
    byIds(db, "coaching_notes", "coaching_id", ids(asClient)).then((rows) => rows.filter((row) => row.visible_to_client === true)),
    byIds(db, "coaching_trainer_meta", "coaching_id", ids(asTrainer)),
    byIds(db, "milestones", "coaching_id", ids(pairs)),
    byIds(db, "workout_log_exercises", "log_id", ids(logs)),
    // Names of the other side of each pair, as the app shows them; nothing else about them.
    byIds(db, "profiles", "id", partners).then((rows) =>
      rows.map(({ id, first_name, last_name, display_name, username }) => ({ id, first_name, last_name, display_name, username })),
    ),
    mine("trainer_profiles", "user_id"),
    mine("trainer_certificates", "trainer_id"),
    mine("trainer_verifications", "trainer_id"),
    mine("client_invites", "trainer_id"),
    mine("trial_links", "trainer_id"),
    mine("locations", "trainer_id"),
    mine("week_templates", "trainer_id"),
    mine("slots", "trainer_id"),
    mine("recurrences", "trainer_id"),
    mine("packages", "trainer_id"),
    mine("payment_links", "trainer_id"),
    mine("workout_templates", "owner_id"),
    mine("exercises", "owner_id"),
  ]);

  const [sets, weekItems, templateItems] = await Promise.all([
    byIds(db, "workout_sets", "log_exercise_id", ids(logExercises)),
    byIds(db, "week_template_items", "template_id", ids(weekTemplates)),
    byIds(db, "workout_template_items", "template_id", ids(templates)),
  ]);

  return {
    profile,
    settings,
    notification_preferences: preferences,
    consents,
    roles,
    plan_grants: plans,
    access_requests: accessRequests,
    intake: intakes,
    measurements,
    progress_photos: photos,
    personal_records: records,
    workout_logs: logs,
    workout_log_exercises: logExercises,
    workout_sets: sets,
    feedback,
    contact_requests: contacts,
    pairs,
    people,
    data_shares: shares,
    notes: merge(trainerNotes, clientNotes),
    client_cards: trainerMeta,
    milestones,
    sessions: merge(trainerSessions, clientSessions),
    bookings,
    booking_events: bookingEvents,
    passes,
    pass_freezes: freezes,
    payments,
    ledger_entries: ledger,
    money_events: moneyEvents,
    trainer_profile: trainer,
    certificates,
    verifications,
    client_invites: invites,
    trial_links: trialLinks,
    locations,
    week_templates: weekTemplates,
    week_template_items: weekItems,
    slots,
    recurrences,
    packages,
    payment_links: paymentLinks,
    workout_templates: templates,
    workout_template_items: templateItems,
    exercises,
  };
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One table as CSV with a header of every column seen; a BOM, so Excel opens Cyrillic as UTF-8. */
export function toCsv(rows: Row[]): string {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [columns.map(cell).join(","), ...rows.map((row) => columns.map((column) => cell(row[column])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** The archive's file name for a photo: date, angle and the stored extension. */
export function photoEntryName(photo: Row): string {
  const extension = String(photo.storage_path).split(".").pop() ?? "webp";
  return `photos/${String(photo.taken_on)}-${String(photo.angle)}.${extension}`;
}

const encoder = new TextEncoder();

/**
 * Builds the export into the owner's folder and returns that folder, for complete_data_export. Text goes in
 * part 1; photos follow and open a new part whenever the current one would pass PART_LIMIT.
 */
export async function buildExport(admin: Admin, exportId: string, userId: string, locale: Locale): Promise<string> {
  const tables = await collectExport(admin, userId);
  const folder = `${userId}/${exportId}`;
  const entries: ZipEntry[] = [{ name: "README.txt", data: encoder.encode(`${Object.values(dictionaries[locale].account.export.readme).join("\n\n")}\n`) }];
  for (const [name, rows] of Object.entries(tables)) {
    entries.push({ name: `data/${name}.json`, data: encoder.encode(JSON.stringify(rows, null, 2)) });
    if (rows.length) entries.push({ name: `csv/${name}.csv`, data: encoder.encode(toCsv(rows)) });
  }

  let part = 1;
  let size = entries.reduce((sum, entry) => sum + entry.data.length, 0);
  const upload = async (files: ZipEntry[]) => {
    const { error } = await admin.storage
      .from(EXPORT_BUCKET)
      .upload(`${folder}/part-${part}.zip`, new Blob([zip(files) as BlobPart], { type: "application/zip" }), {
        contentType: "application/zip",
        upsert: true,
      });
    if (error) throw new Error(`export: uploading part ${part} failed: ${error.name}`);
    part += 1;
  };

  for (const photo of tables.progress_photos) {
    const { data, error } = await admin.storage.from(PHOTO_BUCKET).download(String(photo.storage_path));
    // A photo whose object is gone is listed in progress_photos.json and skipped here.
    if (error || !data) continue;
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (size + bytes.length > PART_LIMIT && entries.length) {
      await upload(entries.splice(0));
      size = 0;
    }
    entries.push({ name: photoEntryName(photo), data: bytes });
    size += bytes.length;
  }
  await upload(entries);
  return folder;
}

/** Every object under a folder of a bucket, at any depth (Storage lists one level at a time). */
export async function listObjects(admin: Admin, bucket: string, folder: string): Promise<string[]> {
  const found: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`listing ${bucket} failed: ${error.name}`);
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      // Folders come back without an id.
      if (item.id) found.push(path);
      else found.push(...(await listObjects(admin, bucket, path)));
    }
    if (data.length < PAGE) return found;
  }
}

/** Removes every object under a folder of a bucket. */
export async function removeFolder(admin: Admin, bucket: string, folder: string): Promise<void> {
  const paths = await listObjects(admin, bucket, folder);
  for (let index = 0; index < paths.length; index += PAGE) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + PAGE));
    if (error) throw new Error(`removing from ${bucket} failed: ${error.name}`);
  }
}
