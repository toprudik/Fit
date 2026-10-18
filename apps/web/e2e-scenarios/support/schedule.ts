import { expect, type Locator, type Page } from "@playwright/test";
import type { Persona } from "./personas";
import { ok } from "./personas";

/*
 * Scene setting for the schedule and booking scenarios: times in Moscow (the persona's browser and the
 * trainer's default zone), week templates, sessions and passes made through the trainer's own RPCs.
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The calendar day in Moscow, `days` from today, as YYYY-MM-DD. */
export function mskDay(days = 0): string {
  return new Date(Date.now() + MSK_OFFSET_MS + days * 86_400_000).toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday) of a YYYY-MM-DD day. */
export function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** An instant at hh:mm Moscow time, `days` from today. */
export function mskAt(days: number, hours: number, minutes = 0): string {
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return new Date(`${mskDay(days)}T${hh}:${mm}:00+03:00`).toISOString();
}

/** An instant relative to now, rounded down to the minute. */
export function fromNow(minutes: number): string {
  const at = new Date(Date.now() + minutes * 60_000);
  at.setUTCSeconds(0, 0);
  return at.toISOString();
}

export type TemplateItem = { iso_weekday: number; start_time: string; end_time: string; duration_min: number; mode?: "offline" | "online" };

/** Saves the trainer's week template, which cuts the windows into open slots. Returns how many slots. */
export async function saveTemplate(trainer: Persona, items: TemplateItem[], horizonWeeks = 1): Promise<number> {
  return ok(await trainer.db.rpc("save_week_template", { p_items: items, p_horizon_weeks: horizonWeeks, p_buffer_min: 0 }), "week template");
}

/** One window on the weekday `days` from today (less than a week ahead), cut into hour slots, open for a week. */
export async function openWindow(trainer: Persona, days: number, from: number, to: number): Promise<number> {
  const pad = (hours: number) => `${String(hours).padStart(2, "0")}:00`;
  return saveTemplate(trainer, [{ iso_weekday: isoWeekday(mskDay(days)), start_time: pad(from), end_time: pad(to), duration_min: 60 }]);
}

/** The trainer's open slots in time order. */
export async function openSlots(trainer: Persona) {
  return ok(
    await trainer.db.from("slots").select("id, starts_at, ends_at, status").eq("trainer_id", trainer.userId).eq("status", "open").order("starts_at"),
    "slots",
  );
}

export async function createSession(
  trainer: Persona,
  coachingId: string,
  startsAt: string,
  options: { durationMin?: number; title?: string; weekdays?: number[]; count?: number } = {},
): Promise<string> {
  const rows = ok(
    await trainer.db.rpc("create_session", {
      p_coaching_id: coachingId,
      p_starts_at: startsAt,
      p_duration_min: options.durationMin ?? 60,
      p_mode: "offline",
      p_title: options.title,
      p_weekdays: options.weekdays,
      p_count: options.count,
    }),
    "create session",
  );
  return rows[0].session_id;
}

export async function createGroup(trainer: Persona, title: string, startsAt: string, capacity: number): Promise<string> {
  const rows = ok(
    await trainer.db.rpc("create_group_session", {
      p_title: title,
      p_starts_at: startsAt,
      p_duration_min: 60,
      p_mode: "offline",
      p_capacity: capacity,
      p_open_for_booking: true,
    }),
    "create group session",
  );
  return rows[0].session_id;
}

/** A pass of `sessions` sessions the trainer sells to the client, paid in cash. */
export async function createPass(trainer: Persona, coachingId: string, sessions = 10, title = "10 занятий"): Promise<string> {
  const rows = ok(
    await trainer.db.rpc("create_pass", {
      p_coaching_id: coachingId,
      p_sessions: sessions,
      p_title: title,
      p_price_minor: 2_000_000,
      p_currency: "RUB",
      p_validity_days: 60,
    }),
    "create pass",
  );
  return rows[0].pass_id;
}

/** The booking of the client on a session, read as the trainer. */
export async function bookingsOf(trainer: Persona, sessionId: string) {
  return ok(await trainer.db.from("bookings").select("id, status, client_id").eq("session_id", sessionId), "bookings");
}

/** A session the trainer already held three hours ago, recorded after the fact (attended unless said otherwise). */
export async function pastSession(trainer: Persona, coachingId: string, status: "attended" | "no_show" = "attended") {
  const [row] = ok(
    await trainer.db.rpc("record_past_session", {
      p_coaching_id: coachingId,
      p_starts_at: fromNow(-180),
      p_duration_min: 60,
      p_mode: "offline",
      p_status: status,
    }),
    "past session",
  );
  return { sessionId: row.session_id, bookingId: row.booking_id };
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(iso));

/**
 * A session on today's date in Moscow: later today when there is time left, otherwise one held earlier
 * today. Returns its "hh:mm–hh:mm" as the screens print it.
 */
export async function todayStart(trainer: Persona, coachingId: string) {
  const mskHour = new Date(Date.now() + MSK_OFFSET_MS).getUTCHours();
  if (mskHour < 22) {
    const startsAt = fromNow(60);
    const sessionId = await createSession(trainer, coachingId, startsAt);
    return { sessionId, label: `${clock(startsAt)}–${clock(new Date(Date.parse(startsAt) + 3_600_000).toISOString())}` };
  }
  const startsAt = fromNow(-75);
  const [row] = ok(
    await trainer.db.rpc("record_past_session", { p_coaching_id: coachingId, p_starts_at: startsAt, p_duration_min: 60, p_mode: "offline" }),
    "past session today",
  );
  return { sessionId: row.session_id, label: `${clock(startsAt)}–${clock(new Date(Date.parse(startsAt) + 3_600_000).toISOString())}` };
}

/** The ledger lines of a pair, read as its trainer: grants, charges, waivers and so on. */
export async function ledgerTypes(trainer: Persona, coachingId: string) {
  const rows = ok(
    await trainer.db.from("ledger_entries").select("entry_type, created_at").eq("coaching_id", coachingId).order("created_at"),
    "ledger",
  );
  return rows.map((row) => row.entry_type);
}

/**
 * Opens a page and waits until React has hydrated its form: a value typed before that is lost to the
 * component's state, as a person tapping that early would lose it too.
 */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => {
    const control = document.querySelector("main input, main select, main button");
    return control !== null && Object.keys(control).some((key) => key.startsWith("__reactProps$"));
  });
}

/** Clicks a control once React has hydrated it, so the click reaches its handler. */
export async function tap(control: Locator) {
  await expect
    .poll(() => control.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
    .toBe(true);
  await control.click();
}
