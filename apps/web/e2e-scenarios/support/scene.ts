import { randomUUID } from "node:crypto";
import type { Json } from "../../src/lib/supabase/database.types";
import { ok, type Persona } from "./personas";

/*
 * A populated scene for the sweep and the visual snapshots: one trainer with one client who has a
 * pass, sessions this week, a payment, a food entry, a measurement, a workout log and a group. All of
 * it is made through the RPCs and tables the screens use, as the trainer or the client (RLS applies).
 */

const MSK = "Europe/Moscow";

/** A calendar day in Moscow as YYYY-MM-DD, `offset` days from today. */
export function mskDay(offset = 0): string {
  const now = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** An instant on a Moscow day at hh:00 (Moscow is UTC+3 all year). */
export function mskAt(offset: number, hour: number): string {
  return new Date(`${mskDay(offset)}T${String(hour).padStart(2, "0")}:00:00+03:00`).toISOString();
}

export type Scene = {
  coachingId: string;
  passId: string;
  /** Tomorrow 10:00 and the day after at 12:00, both confirmed for the client. */
  sessionIds: string[];
  bookingId: string;
  /** Yesterday 10:00, attended. */
  pastSessionId: string;
  pastBookingId: string;
  /** A slot the client asked for, waiting for the trainer's answer. */
  requestId: string | null;
  exerciseId: string;
  /** The client's own log. */
  workoutLogId: string;
  /** A log the trainer wrote for the pair. */
  pairLogId: string;
  templateId: string;
  groupId: string | null;
  challengeId: string | null;
  homeworkId: string | null;
  /** The trainer's own exercise. */
  ownExerciseId: string;
  /** The trainer's dispute of the client's review (an open report for /admin/reviews). */
  reportId: string | null;
  /** The client's "Попросить связаться" request. */
  contactRequestId: string | null;
  /** The client's own product. */
  foodId: string;
  /** The trainer's client link token (/i/<token>). */
  inviteToken: string;
  /** The trainer's showcase address (/trainers/<slug>). */
  slug: string;
  feedbackId: string;
  month: string;
  /** Which optional pieces could not be made, and why: the sweep skips their routes. */
  missing: Record<string, string>;
};

/**
 * Builds the scene. With an admin, the trainer first gets the Pro plan the way the team grants it
 * (/admin/users), so the Pro screens (groups, analytics, finance) have something to show.
 */
export async function buildScene(trainer: Persona, client: Persona & { coachingId: string }, admin?: Persona): Promise<Scene> {
  const { coachingId } = client;
  const missing: Record<string, string> = {};
  if (admin) {
    ok(
      await admin.db.rpc("admin_grant_plan", {
        p_user_id: trainer.userId,
        p_plan_code: "trainer_pro",
        p_reason: "e2e scene",
      }),
      "trainer pro plan",
    );
  }

  // A pass of 10 sessions, paid in full: the payment is recorded with it.
  const pass = ok(
    await trainer.db.rpc("create_pass", {
      p_coaching_id: coachingId,
      p_title: "Пакет 10 занятий",
      p_sessions: 10,
      p_price_minor: 2_500_000,
      p_currency: "RUB",
      p_payment_minor: 2_500_000,
      p_payment_method: "cash",
      p_paid_at: mskAt(-1, 9),
      p_validity_days: 60,
      p_starts_on: mskDay(-7),
    }),
    "create pass",
  )[0];

  const sessionIds: string[] = [];
  for (const [offset, hour] of [
    [1, 10],
    [2, 12],
  ] as const) {
    const made = ok(
      await trainer.db.rpc("create_session", {
        p_coaching_id: coachingId,
        p_starts_at: mskAt(offset, hour),
        p_duration_min: 60,
        p_mode: "offline",
        p_title: "Силовая",
      }),
      "create session",
    );
    sessionIds.push(made[0].session_id);
  }
  const past = ok(
    await trainer.db.rpc("record_past_session", {
      p_coaching_id: coachingId,
      p_starts_at: mskAt(-1, 10),
      p_duration_min: 60,
      p_mode: "offline",
      p_status: "attended",
      p_title: "Силовая",
    }),
    "record past session",
  )[0];

  // Two earlier attended sessions: three in all, enough for a review (R: 3 attended sessions).
  for (const offset of [-3, -5]) {
    ok(
      await trainer.db.rpc("record_past_session", {
        p_coaching_id: coachingId,
        p_starts_at: mskAt(offset, 10),
        p_duration_min: 60,
        p_mode: "offline",
        p_status: "attended",
        p_title: "Силовая",
      }),
      "earlier past session",
    );
  }

  const booking = ok<{ id: string }>(
    await client.db.from("bookings").select("id").eq("session_id", sessionIds[0]).limit(1).single(),
    "booking of the first session",
  );

  // Open hours on the day after tomorrow's weekday and a client request for one slot.
  let requestId: string | null = null;
  const weekday = ((new Date(`${mskDay(3)}T12:00:00+03:00`).getUTCDay() + 6) % 7) + 1;
  ok(
    await trainer.db.rpc("save_week_template", {
      p_items: [
        {
          iso_weekday: weekday,
          start_time: "15:00",
          end_time: "18:00",
          duration_min: 60,
          mode: "offline",
        },
      ] as Json,
    }),
    "week template",
  );
  const slot = await client.db.from("slots").select("id").eq("trainer_id", trainer.userId).eq("status", "open").order("starts_at").limit(1);
  if (slot.error || !slot.data?.length) missing.request = `no open slot: ${slot.error?.message ?? "none generated"}`;
  else {
    const booked = await client.db.rpc("book_slot", {
      p_slot_id: slot.data[0].id,
    });
    if (booked.error) missing.request = `book_slot: ${booked.error.message}`;
    else requestId = (booked.data as { booking_id: string }[])[0]?.booking_id ?? null;
  }

  // Diary: a food entry, a weight, a workout log.
  ok(
    await client.db.rpc("add_food_entry", {
      p_day: mskDay(0),
      p_meal: "breakfast",
      p_title: "Овсянка с ягодами",
      p_grams: 250,
      p_kcal: 320,
      p_protein: 11,
      p_fat: 7,
      p_carbs: 52,
    }),
    "food entry",
  );
  ok(
    await client.db.from("measurements").insert({
      client_id: client.userId,
      kind: "weight",
      value: 68.4,
      measured_at: mskAt(-1, 8),
      local_date: mskDay(-1),
    }),
    "measurement",
  );
  const exercises = ok(await client.db.rpc("search_exercises", { p_query: "", p_limit: 1 }), "exercise");
  const exerciseId = (exercises as { id: string }[])[0].id;
  const log = (who: string, coaching: string | null, hour: number) => ({
    client_id: client.userId,
    coaching_id: coaching,
    title: who,
    performed_at: mskAt(-1, hour),
    local_date: mskDay(-1),
    duration_min: 50,
    exercises: [
      {
        exercise_id: exerciseId,
        sets: [
          { reps: 10, weight_kg: 40 },
          { reps: 8, weight_kg: 45 },
        ],
      },
    ],
  });
  // The client's own log, and one the trainer wrote for the pair.
  const workoutLogId = ok(await client.db.rpc("save_workout_log", { p_log: log("Ноги", null, 18) }), "client workout log");
  const pairLogId = ok(
    await trainer.db.rpc("save_workout_log", {
      p_log: log("Спина", coachingId, 11),
    }),
    "pair workout log",
  );
  const templateId = ok(
    await trainer.db.rpc("save_workout_template", {
      p_template: {
        title: "Верх тела",
        items: [{ exercise_id: exerciseId, target_sets: 3, target_reps: 10 }],
      },
    }),
    "workout template",
  );

  let homeworkId: string | null = null;
  const homework = await trainer.db.rpc("save_homework", {
    p_homework: {
      coaching_id: coachingId,
      title: "Растяжка",
      description: "15 минут вечером",
      due_date: mskDay(1),
      exercises: [{ exercise_id: exerciseId, prescription: "3 × 30 с" }],
    },
  });
  if (homework.error) missing.homework = `save_homework: ${homework.error.message}`;
  else homeworkId = homework.data;

  // A group with the client in it, and a challenge in the group.
  let groupId: string | null = null;
  let challengeId: string | null = null;
  const group = await trainer.db
    .from("groups")
    .insert({
      trainer_id: trainer.userId,
      name: "Утренняя группа",
      goal: "lose",
    })
    .select("id")
    .single();
  if (group.error) missing.group = `groups insert: ${group.error.code} ${group.error.message}`;
  else {
    groupId = group.data.id;
    ok(
      await trainer.db.rpc("add_group_member", {
        p_group_id: groupId,
        p_coaching_id: coachingId,
      }),
      "group member",
    );
    const challenge = await trainer.db.rpc("create_challenge", {
      p_group_id: groupId,
      p_title: "10 000 шагов",
      p_metric: "steps",
      p_starts_on: mskDay(0),
      p_weeks: 2,
    });
    if (challenge.error) missing.challenge = `create_challenge: ${challenge.error.message}`;
    else challengeId = challenge.data;
  }

  const ownExercise = ok<{ id: string }>(
    await trainer.db
      .from("exercises")
      .insert({
        source: "custom",
        owner_id: trainer.userId,
        name: "Жим гантелей сидя",
        category: "shoulders",
        muscles_primary: [],
        equipment: [],
      })
      .select("id")
      .single(),
    "own exercise",
  );
  ok(
    await trainer.db.from("exercise_translations").insert({
      exercise_id: ownExercise.id,
      locale: "ru",
      name: "Жим гантелей сидя",
      description: null,
    }),
    "own exercise name",
  );

  // A review from the client, disputed by the trainer.
  let reportId: string | null = null;
  const review = await client.db.rpc("save_review", {
    p_coaching_id: coachingId,
    p_rating: 4,
    p_body: "Внимательный тренер, но иногда опаздывает.",
  });
  if (review.error) missing.review = `save_review: ${review.error.message}`;
  else {
    const dispute = await trainer.db.rpc("dispute_review", {
      p_review_id: review.data,
      p_reason: "false_facts",
      p_body: "Ни разу не опоздал.",
    });
    if (dispute.error) missing.review = `dispute_review: ${dispute.error.message}`;
    else reportId = dispute.data;
  }

  let contactRequestId: string | null = null;
  const contact = await client.db.rpc("request_contact", {
    p_coaching_id: coachingId,
  });
  if (contact.error) missing.contact = `request_contact: ${contact.error.message}`;
  else contactRequestId = contact.data;

  const foodId = ok(
    await client.db.rpc("save_food", {
      p_id: null as unknown as string,
      p_name: "Творог 5%",
      p_kcal: 121,
      p_protein: 17,
      p_fat: 5,
      p_carbs: 3,
    }),
    "own food",
  );
  const inviteToken = ok(await trainer.db.rpc("my_client_invite"), "client invite")[0].token;

  const { slug } = ok<{ slug: string }>(
    await trainer.db.from("trainer_profiles").select("slug").eq("user_id", trainer.userId).single(),
    "slug",
  );

  const feedbackId = randomUUID();
  ok(
    await client.db.from("feedback").insert({
      id: feedbackId,
      user_id: client.userId,
      zone: "client",
      kind: "idea",
      body: "Хочу тёмную тему по расписанию",
      route: "/client",
    }),
    "feedback",
  );

  return {
    coachingId,
    passId: pass.pass_id,
    sessionIds,
    bookingId: booking.id,
    pastSessionId: past.session_id,
    pastBookingId: past.booking_id,
    requestId,
    exerciseId,
    workoutLogId,
    pairLogId,
    templateId,
    groupId,
    challengeId,
    homeworkId,
    ownExerciseId: ownExercise.id,
    reportId,
    contactRequestId,
    foodId,
    inviteToken,
    slug,
    feedbackId,
    month: mskDay(0).slice(0, 7),
    missing,
  };
}
