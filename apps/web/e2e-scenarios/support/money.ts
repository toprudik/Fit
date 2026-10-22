import { ok, type Persona } from "./personas";

/*
 * Scenes for the money and growth scenarios: packages, sessions that already happened (they charge a pass or
 * become a debt), passes and the Pro plan. All of it the way the screens do it, as the persona under RLS.
 */

const MSK = "Europe/Moscow";

/** "YYYY-MM-DD" in Moscow, `offset` days from today. */
export function moscowDay(offset = 0): string {
  const at = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: MSK, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** "15 марта 2026" for a Moscow day, as the screens print a day. */
export function ruDay(day: string, withYear = true): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** A price as the screens write it in rubles, whatever spaces Intl puts between the groups: "18 000 ₽". */
export function rub(major: number): RegExp {
  const digits = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, "\\s");
  return new RegExp(`${digits}\\s₽`);
}

export async function trainerCurrency(trainer: Persona): Promise<string> {
  const row = ok(await trainer.db.from("trainer_profiles").select("default_currency").eq("user_id", trainer.userId).single(), "trainer currency");
  return (row as unknown as { default_currency: string }).default_currency;
}

/** A live package of the trainer, straight into `packages` as the packages screen saves it. */
export async function addPackage(
  trainer: Persona,
  pack: { title: string; sessions: number; priceMajor: number; validityDays?: number | null; isPublic?: boolean },
): Promise<string> {
  const currency = await trainerCurrency(trainer);
  const row = ok(
    await trainer.db
      .from("packages")
      .insert({
        trainer_id: trainer.userId,
        currency,
        title: pack.title,
        sessions_count: pack.sessions,
        price_minor: pack.priceMajor * 100,
        validity_days: pack.validityDays ?? null,
        is_public: pack.isPublic ?? true,
      })
      .select("id")
      .single(),
    "package",
  );
  return (row as unknown as { id: string }).id;
}

/**
 * Personal sessions that already happened ("Дозаписать занятие"), one a day going back from yesterday. Attended
 * ones charge the client's pass, or become a debt when there is none.
 */
export async function recordPastSessions(trainer: Persona, coachingId: string, count: number, status: "attended" | "no_show" = "attended") {
  for (let index = 0; index < count; index += 1) {
    // 10:00 on the Moscow days before today, like the pass start (moscowDay), so the count holds at any UTC hour.
    const startsAt = new Date(`${moscowDay(-(index + 1))}T10:00:00+03:00`);
    ok(
      await trainer.db.rpc("record_past_session", {
        p_coaching_id: coachingId,
        p_starts_at: startsAt.toISOString(),
        p_duration_min: 60,
        p_mode: "offline",
        p_status: status,
      }),
      "record past session",
    );
  }
}

/** A pass with custom terms, sold by the trainer; paid in full when `paid`. */
export async function sellPass(
  trainer: Persona,
  coachingId: string,
  pass: { title: string; sessions: number; priceMajor: number; paid?: boolean; validityDays?: number; startsOn?: string },
): Promise<string> {
  const result = ok(
    await trainer.db.rpc("create_pass", {
      p_coaching_id: coachingId,
      p_title: pass.title,
      p_sessions: pass.sessions,
      p_price_minor: pass.priceMajor * 100,
      p_currency: await trainerCurrency(trainer),
      p_validity_days: pass.validityDays,
      p_starts_on: pass.startsOn ?? moscowDay(-3),
      ...(pass.paid ? { p_payment_minor: pass.priceMajor * 100, p_payment_method: "cash" as const, p_paid_at: new Date().toISOString() } : {}),
    }),
    "create pass",
  );
  return result[0].pass_id;
}

/** Pro for a trainer, granted by an admin as /admin/plans does (no user can grant a plan to themselves). */
export async function grantPro(admin: Persona, user: Persona, plan: "trainer_pro" | "client_premium" = "trainer_pro") {
  ok(await admin.db.rpc("admin_grant_plan", { p_user_id: user.userId, p_plan_code: plan, p_reason: "e2e scenario" }), "grant plan");
}

/** Free weekday windows for two weeks ahead, every day 09:00–18:00 MSK, so a trial always finds a time. */
export async function openWeek(trainer: Persona) {
  const items = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
    iso_weekday: day,
    start_time: "09:00",
    end_time: "18:00",
    duration_min: 60,
    mode: "online",
    location_id: null,
    meeting_url: "https://meet.example.invalid/e2e",
  }));
  ok(await trainer.db.rpc("save_week_template", { p_items: items, p_horizon_weeks: 2, p_buffer_min: 0 }), "week template");
}
