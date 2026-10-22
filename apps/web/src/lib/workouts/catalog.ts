/**
 * Keys of the exercise library (PRD wave-1 §2.10-1): the categories, muscles and equipment the wger import
 * writes (scripts/wger/build-migration.mjs) and a trainer picks for an own exercise. The UI names them from
 * the dictionary; a value outside these lists (an older import) is shown as is.
 */
export const EXERCISE_CATEGORIES = ["legs", "back", "chest", "shoulders", "arms", "abs", "calves", "cardio"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];

export const MUSCLES = [
  "chest",
  "shoulders",
  "biceps",
  "triceps",
  "brachialis",
  "lats",
  "traps",
  "serratus",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "soleus",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = [
  "bodyweight",
  "barbell",
  "dumbbell",
  "kettlebell",
  "ez_bar",
  "cable",
  "bench",
  "incline_bench",
  "pull_up_bar",
  "band",
  "mat",
  "swiss_ball",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_NAME_MAX_LENGTH = 200;
export const EXERCISE_DESCRIPTION_MAX_LENGTH = 5000;
export const VIDEO_URL_MAX_LENGTH = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isExerciseId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isCategory(value: unknown): value is ExerciseCategory {
  return typeof value === "string" && (EXERCISE_CATEGORIES as readonly string[]).includes(value);
}

export type LibraryQuery = { q?: string; category?: ExerciseCategory; own?: boolean };

/** The query of the library screen from its URL: a known category, "own" only as "1", a query of 1–100 characters. */
export function libraryQuery(params: { q?: string | string[]; category?: string | string[]; own?: string | string[] }): LibraryQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const q = first(params.q)?.trim().slice(0, 100);
  const category = first(params.category);
  return { q: q || undefined, category: isCategory(category) ? category : undefined, own: first(params.own) === "1" || undefined };
}

/** The label of a key from one of the lists above, or the raw value when the dictionary has none. */
export function keyLabel(labels: Readonly<Record<string, string>>, key: string): string {
  return Object.hasOwn(labels, key) ? labels[key] : key;
}

/**
 * A video link as stored: https only (the database checks the same), trimmed, at most 500 characters.
 * Empty means no video; anything else that does not pass is `undefined`.
 */
export function normalizeVideoUrl(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > VIDEO_URL_MAX_LENGTH) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** "CC-BY-SA-4.0" → "CC-BY-SA 4.0", the way the attribution line names a license. */
export function licenseLabel(license: string): string {
  return license.replace(/-(\d+\.\d+)$/, " $1");
}

/**
 * The description to show: in the reader's language, else (own exercises only) English or the text the owner wrote.
 * A wger description in another language is left out, since English text on a Russian screen reads as a bug.
 */
export function exerciseDescription(
  source: "wger" | "custom",
  local: string | null | undefined,
  english: string | null | undefined,
  authored: string | null | undefined,
): string | null {
  if (local) return local;
  if (source === "wger") return null;
  return english ?? authored ?? null;
}
