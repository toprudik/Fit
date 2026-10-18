import { deflateSync } from "node:zlib";
import { expect, type Locator, type Page } from "@playwright/test";
import { expectAccessible, settle } from "../../e2e/support";
import { ok, type Persona } from "./personas";

/*
 * Helpers for the diary, workouts and progress scenarios: Moscow days, scene pieces made through the RPCs
 * the screens use (as the persona, under RLS), and a small generated PNG for the photo upload.
 */

const MSK = "Europe/Moscow";

/** A calendar day in Moscow as YYYY-MM-DD, `offset` days from today. */
export function mskDay(offset = 0): string {
  const now = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: MSK, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** An instant on a Moscow day at hh:00 (Moscow is UTC+3 all year). */
export function mskAt(day: string, hour: number): string {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+03:00`).toISOString();
}

/** The 15th of the month before the current Moscow month, and that month as "YYYY-MM". */
export function lastMonth(): { day: string; month: string } {
  const [year, month] = mskDay().split("-").map(Number);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const mm = String(previous.month).padStart(2, "0");
  return { day: `${previous.year}-${mm}-15`, month: `${previous.year}-${mm}` };
}

/** Goes to a route and waits until the screen has no skeleton left, then checks it with axe. */
export async function open(page: Page, path: string, heading?: string | RegExp) {
  await page.goto(path);
  if (heading) await expect(page.getByRole("heading", { level: 1, name: heading }).first()).toBeVisible();
  await expect(page.locator('[data-slot="skeleton-rows"]')).toHaveCount(0);
}

/** Picks a chip or choice row by clicking the label that wraps its radio or checkbox, then checks it took. */
export async function pick(scope: Page | Locator, role: "radio" | "checkbox", name: string | RegExp) {
  const input = scope.getByRole(role, { name });
  const label = scope.locator("label").filter({ has: input });
  // A segmented control's items are buttons with the radio role, with no label around them.
  await ((await label.count()) > 0 ? label.first() : input).click();
  await expect(input).toBeChecked();
}

/** axe on the current screen, after its transitions. */
export async function checked(page: Page) {
  await settle(page);
  await expectAccessible(page);
}

/** An own product per 100 g, as "Новый продукт" saves it. */
export async function ownFood(
  persona: Persona,
  food: { name: string; kcal: number; protein?: number; fat?: number; carbs?: number; servingG?: number; servingLabel?: string; barcode?: string },
): Promise<string> {
  return ok(
    await persona.db.rpc("save_food", {
      p_id: null as unknown as string,
      p_name: food.name,
      p_kcal: food.kcal,
      ...(food.protein === undefined ? {} : { p_protein: food.protein }),
      ...(food.fat === undefined ? {} : { p_fat: food.fat }),
      ...(food.carbs === undefined ? {} : { p_carbs: food.carbs }),
      ...(food.servingG === undefined ? {} : { p_serving_g: food.servingG }),
      ...(food.servingLabel === undefined ? {} : { p_serving_label: food.servingLabel }),
      ...(food.barcode === undefined ? {} : { p_barcode: food.barcode }),
    }),
    "save food",
  );
}

/** Quick kcal in the diary, as the "Калории" tab adds them. */
export async function quickEntry(persona: Persona, entry: { day?: string; meal: "breakfast" | "lunch" | "dinner" | "snack"; kcal: number; title: string }) {
  ok(
    await persona.db.rpc("add_food_entry", { p_day: entry.day ?? mskDay(), p_meal: entry.meal, p_kcal: entry.kcal, p_title: entry.title }),
    "food entry",
  );
}

/** An exercise from the wger library found by name, the way the picker finds it. */
export async function exerciseId(persona: Persona, query: string): Promise<{ id: string; name: string }> {
  const found = ok(await persona.db.rpc("search_exercises", { p_query: query, p_limit: 5, p_locale: "ru" }), "search exercises") as {
    id: string;
    name: string;
  }[];
  expect(found.length, `an exercise for «${query}»`).toBeGreaterThan(0);
  return found[0];
}

/** A workout log through save_workout_log: the client's own when coachingId is null. */
export async function workoutLog(
  author: Persona,
  log: { clientId: string; coachingId: string | null; title: string; day: string; exercise: string; sets: { reps: number; weight_kg?: number }[] },
): Promise<string> {
  return ok(
    await author.db.rpc("save_workout_log", {
      p_log: {
        client_id: log.clientId,
        coaching_id: log.coachingId,
        title: log.title,
        performed_at: mskAt(log.day, 18),
        local_date: log.day,
        duration_min: 45,
        exercises: [{ exercise_id: log.exercise, sets: log.sets }],
      },
    }),
    "workout log",
  );
}

/** The trainer's target for the pair, as "Задать норму" saves it. */
export async function trainerTarget(trainer: Persona, coachingId: string, kcal: number) {
  ok(
    await trainer.db.rpc("set_nutrition_target", { p_coaching_id: coachingId, p_kcal: kcal, p_protein_g: 120, p_fat_g: 60, p_carbs_g: 200 }),
    "nutrition target",
  );
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A plain RGB PNG of the given size and color: a stand-in for a progress photo with no face on it. */
export function solidPng(width = 120, height = 160, rgb: [number, number, number] = [180, 140, 120]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
