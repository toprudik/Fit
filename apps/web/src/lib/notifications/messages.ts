import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { dictionaries, type Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural, type PluralForms } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import { isPairId } from "@/lib/pairs/clients";
import { formatSessionTime } from "@/lib/pairs/format";
import { DEFAULT_TIME_ZONE, formatPlanDate, isPlanCode } from "@/lib/plans/plans";
import { formatOffset } from "@/lib/reminders/offsets";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { InlineButton } from "./telegram";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

/** What a template needs: the recipient's catalog and language, their time zone and the row payload. */
type TemplateContext = {
  t: Dictionary["botMessages"];
  locale: Locale;
  timeZone: string | null;
  payload: Record<string, Json | undefined>;
};

/** A button opens an app route; the dispatcher turns it into a Mini App or a link button. */
type Template = (context: TemplateContext) => { text: string; buttons: { text: string; path: string }[] };

/**
 * One template per notification type (PRD §3). A type gets its template together with the feature that queues
 * it; until then a queued row of that type fails with no_template, so a missing text shows up in the outbox.
 */
const templates: Partial<Record<NotificationType, Template>> = {
  bot_test: ({ t }) => ({ text: escapeHtml(t.botTest), buttons: [{ text: t.open, path: "/" }] }),
  // С3: payload { decision, reason? } from admin_decide_verification.
  verification_result: ({ t, payload }) => ({
    text:
      payload.decision === "verified"
        ? escapeHtml(t.verificationVerified)
        : interpolateEscaped(t.verificationRejected, { reason: String(payload.reason ?? "") }),
    buttons: [{ text: t.openVerification, path: "/trainer/verification" }],
  }),
  // А1 to the admin group: payload { trainer_name, documents } from submit_trainer_verification.
  verification_submitted: ({ t, payload }) => ({
    text: interpolateEscaped(t.verificationSubmitted, {
      name: String(payload.trainer_name ?? ""),
      count: Number(payload.documents ?? 0),
    }),
    buttons: [{ text: t.openQueue, path: "/admin/verification" }],
  }),
  // Т7 and Т7a: payload { coaching_id, claim_id?, first_name, last_name } from the join RPCs.
  coaching_created: ({ t, payload }) => ({
    text: interpolateEscaped(t.newClient, { name: personName(payload) || t.unnamedClient }),
    buttons: [{ text: t.openClient, path: pairPath("/trainer/clients", payload) }],
  }),
  managed_client_claim: ({ t, payload }) => ({
    text: interpolateEscaped(t.newClientWithCards, { name: personName(payload) || t.unnamedClient }),
    buttons: [
      typeof payload.claim_id === "string" && isPairId(payload.claim_id)
        ? { text: t.answerClaim, path: `/trainer/clients/claims/${payload.claim_id}` }
        : { text: t.openClients, path: "/trainer/clients" },
    ],
  }),
  // Т9 and its mirror: payload { coaching_id, ended_by, cancelled, first_name, last_name, reason? } from
  // end_coaching, naming the side that ended the pair. The other side gets it, so the button opens their own
  // zone. A Free trainer's "new client" past the limit ends it with reason plan_limit_reached: К12 (Q65).
  coaching_ended: ({ t, payload }) => {
    const cancelled = Number(payload.cancelled ?? 0);
    if (payload.ended_by === "trainer" && payload.reason === "plan_limit_reached") {
      return {
        text: interpolateEscaped(t.coachingEndedPlanLimit, { name: personName(payload) || t.unnamedTrainer }),
        buttons: [{ text: t.openTrainer, path: pairPath("/client/trainers", payload) }],
      };
    }
    if (payload.ended_by === "trainer") {
      return {
        text: interpolateEscaped(cancelled > 0 ? t.coachingEndedByTrainerCancelled : t.coachingEndedByTrainer, {
          name: personName(payload) || t.unnamedTrainer,
        }),
        buttons: [{ text: t.openTrainer, path: pairPath("/client/trainers", payload) }],
      };
    }
    return {
      text: interpolateEscaped(cancelled > 0 ? t.coachingEndedByClientCancelled : t.coachingEndedByClient, {
        name: personName(payload) || t.unnamedClient,
        count: cancelled,
      }),
      buttons: [{ text: t.openClient, path: pairPath("/trainer/clients", payload) }],
    };
  },
  // The client said "Я оплатил": payload { coaching_id, payment_id, amount_minor, currency, pass_title?, first_name,
  // last_name } from the payments_notify_reported trigger. The balance waits for the trainer's confirmation.
  payment_reported: ({ t, locale, payload }) => {
    const amount =
      typeof payload.amount_minor === "number" && typeof payload.currency === "string"
        ? formatMoney(locale, payload.amount_minor, payload.currency)
        : "";
    const name = personName(payload) || t.unnamedClient;
    return {
      text:
        typeof payload.pass_title === "string" && payload.pass_title
          ? interpolateEscaped(t.paymentReported, { name, amount, pass: payload.pass_title })
          : interpolateEscaped(t.paymentReportedNoPass, { name, amount }),
      buttons: [
        {
          text: t.openPayments,
          path: typeof payload.coaching_id === "string" && isPairId(payload.coaching_id) ? `/trainer/clients/${payload.coaching_id}/payments` : "/trainer/money",
        },
      ],
    };
  },
  // К8: payload { coaching_id, charge_id, reason, starts_at, pass_id?, pass_title?, remaining, debt_sessions,
  // first_name, last_name } from private.notify_charge, for a no-show or a late cancellation.
  charge_posted: (context) => chargeMessage(context, "posted"),
  // К9: the same payload for the waiver, with the reason and start of the forgiven charge.
  charge_waived: (context) => chargeMessage(context, "waived"),
  // К7: payload { booking_id, starts_at, kind, title, mode, location_name, location_address, first_name, last_name,
  // offset_min } from private.sync_booking_reminders. The meeting link stays in DaFit (SCHED-21).
  session_reminder: ({ t, locale, timeZone, payload }) => {
    const text = (value: Json | undefined) => (typeof value === "string" ? value.trim() : "");
    const offset = Number(payload.offset_min);
    const values = {
      lead: Number.isInteger(offset) && offset > 0 ? formatOffset(locale, offset, dictionaries[locale].reminders.units) : "",
      name: personName(payload) || t.unnamedTrainer,
      time: typeof payload.starts_at === "string" ? formatSessionTime(locale, payload.starts_at, timeZone ?? DEFAULT_TIME_ZONE) : "",
      title: text(payload.title),
    };
    const place = [text(payload.location_name), text(payload.location_address)].filter(Boolean).join(", ");
    const lines = [
      interpolateEscaped(payload.kind === "group" && values.title ? t.sessionReminderGroup : t.sessionReminder, values),
      payload.mode === "online" ? escapeHtml(t.reminderOnline) : place ? interpolateEscaped(t.reminderPlace, { place }) : null,
    ];
    const booking = isPairId(payload.booking_id) ? payload.booking_id : null;
    return {
      text: lines.filter(Boolean).join("\n"),
      buttons: [{ text: t.openSession, path: booking ? `/client/sessions?booking=${booking}` : "/client/sessions" }],
    };
  },
  // Т-сводка (NOTIF-5): payload { day, sessions[{ starts_at, kind, title, name, booked }], sessions_count,
  // requests_count, passes[{ name, available, expires_at }], passes_count, debts[{ name, sessions }], debts_count }
  // from private.daily_digest_payload. Lists are capped there; the counts say how many more there are.
  daily_digest: ({ t, locale, timeZone, payload }) => {
    const zone = timeZone ?? DEFAULT_TIME_ZONE;
    const count = (value: Json | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    const items = (value: Json | undefined) =>
      Array.isArray(value)
        ? value.filter((item): item is Record<string, Json> => !!item && typeof item === "object" && !Array.isArray(item))
        : [];
    const text = (value: Json | undefined) => (typeof value === "string" ? value.trim() : "");
    const date = (iso: string, options: Intl.DateTimeFormatOptions, tz: string) =>
      new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: tz }).format(new Date(iso));
    const counted = (forms: PluralForms, value: number, values: Record<string, string | number> = {}) =>
      interpolateEscaped(plural(locale, value, forms), values);
    const more = (shown: number, total: number) =>
      total > shown ? [`• ${interpolateEscaped(t.digestMore, { count: total - shown })}`] : [];

    const day = typeof payload.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.day) ? payload.day : null;
    const lines = [
      interpolateEscaped(t.digestTitle, { date: day ? date(`${day}T12:00:00Z`, { day: "numeric", month: "long" }, "UTC") : "" }),
    ];

    const sessions = items(payload.sessions);
    const sessionsCount = count(payload.sessions_count);
    lines.push("");
    if (sessionsCount > 0) {
      lines.push(counted(t.digestSessions, sessionsCount));
      for (const session of sessions) {
        const time = typeof session.starts_at === "string" ? date(session.starts_at, { hour: "numeric", minute: "2-digit" }, zone) : "";
        lines.push(
          `• ${
            session.kind === "group"
              ? interpolateEscaped(t.digestSessionGroup, {
                  time,
                  title: text(session.title) || t.digestGroup,
                  booked: count(session.booked),
                })
              : interpolateEscaped(t.digestSession, { time, name: text(session.name) || t.unnamedClient })
          }`,
        );
      }
      lines.push(...more(sessions.length, sessionsCount));
    } else {
      lines.push(escapeHtml(t.digestNoSessions));
    }

    const requests = count(payload.requests_count);
    if (requests > 0) lines.push("", counted(t.digestRequests, requests));

    const passes = items(payload.passes);
    const passesCount = count(payload.passes_count);
    if (passesCount > 0) {
      lines.push("", escapeHtml(t.digestPasses));
      for (const pass of passes) {
        const name = text(pass.name) || t.unnamedClient;
        const available = count(pass.available);
        lines.push(
          `• ${
            available > 1 && typeof pass.expires_at === "string"
              ? interpolateEscaped(t.digestPassUntil, { name, date: date(pass.expires_at, { day: "numeric", month: "short" }, zone) })
              : available > 0
                ? counted(t.digestPassLeft, available, { name })
                : interpolateEscaped(t.digestPassEmpty, { name })
          }`,
        );
      }
      lines.push(...more(passes.length, passesCount));
    }

    const debts = items(payload.debts);
    const debtsCount = count(payload.debts_count);
    if (debtsCount > 0) {
      lines.push("", escapeHtml(t.digestDebts));
      for (const debt of debts)
        lines.push(`• ${counted(t.digestDebt, count(debt.sessions), { name: text(debt.name) || t.unnamedClient })}`);
      lines.push(...more(debts.length, debtsCount));
    }

    return { text: lines.join("\n"), buttons: [{ text: t.openToday, path: "/trainer" }] };
  },
  // П1–П3: payload { plan, expires_at? } from admin_grant_plan and admin_revoke_plan (PLAN-5, §2.14-9).
  plan_granted: ({ t, locale, timeZone, payload }) => ({
    text:
      typeof payload.expires_at === "string"
        ? interpolateEscaped(t.planGrantedUntil, { plan: planName(payload), date: formatPlanDate(locale, payload.expires_at, timeZone) })
        : interpolateEscaped(t.planGranted, { plan: planName(payload) }),
    buttons: [{ text: t.openPlan, path: "/settings/plan" }],
  }),
  plan_revoked: ({ t, payload }) => ({
    text: interpolateEscaped(t.planRevoked, { plan: planName(payload) }),
    buttons: [{ text: t.openPlan, path: "/settings/plan" }],
  }),
  plan_expiring: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(t.planExpiring, {
      plan: planName(payload),
      date: typeof payload.expires_at === "string" ? formatPlanDate(locale, payload.expires_at, timeZone) : "",
    }),
    buttons: [{ text: t.openPlan, path: "/settings/plan" }],
  }),
  // Т8: payload { coaching_id, first_name, last_name, parq_flagged } from the intakes trigger.
  intake_submitted: ({ t, payload }) => ({
    text: interpolateEscaped(payload.parq_flagged === true ? t.intakeSubmittedFlagged : t.intakeSubmitted, {
      name: personName(payload) || t.unnamedClient,
    }),
    buttons: [{ text: t.openIntake, path: intakePath("/trainer/clients", payload) }],
  }),
  // "Напомнить": payload { coaching_id, first_name, last_name } of the trainer, from remind_intake.
  intake_reminder: ({ t, payload }) => ({
    text: interpolateEscaped(t.intakeReminder, { name: personName(payload) || t.someTrainer }),
    buttons: [{ text: t.fillIntake, path: intakePath("/client/trainers", payload) }],
  }),
  // К1: payload { session_id, starts_at, mode, location, count, until, first_name, last_name } from create_session,
  // one message for a whole repeat (PRD 2.6.2-5).
  booking_assigned: ({ t, locale, timeZone, payload }) => {
    const count = Number(payload.count ?? 1);
    const values = {
      name: personName(payload) || t.sessionTrainer,
      when: sessionTime(locale, payload.starts_at, timeZone),
      place: place(t, payload),
    };
    const text =
      typeof payload.until === "string"
        ? interpolateEscaped(t.sessionsAssignedUntil, { ...values, until: formatPlanDate(locale, `${payload.until}T12:00:00Z`, "UTC") })
        : count > 1
          ? interpolateEscaped(t.sessionsAssigned, { ...values, count })
          : interpolateEscaped(t.sessionAssigned, values);
    return { text, buttons: [{ text: t.openSessions, path: "/client/sessions" }] };
  },
  // К6: payload { session_id, before_starts_at, starts_at, mode, location, count, first_name, last_name } from
  // update_session, "было → стало" for the first session the change touched.
  session_changed: ({ t, locale, timeZone, payload }) => {
    const count = Number(payload.count ?? 1);
    const before = sessionTime(locale, payload.before_starts_at, timeZone);
    const after = sessionTime(locale, payload.starts_at, timeZone);
    const values = { name: personName(payload) || t.sessionTrainer, before, after, when: after, place: place(t, payload), count };
    const template = before !== after ? (count > 1 ? t.sessionsMoved : t.sessionMoved) : count > 1 ? t.sessionsChanged : t.sessionChanged;
    return { text: interpolateEscaped(template, values), buttons: [{ text: t.openSessions, path: "/client/sessions" }] };
  },
  // К5: payload { session_id, dates, reason, first_name, last_name } from cancel_session, every cancelled date in one
  // message (PRD 2.6.2-5); the trainer cancels without a charge (2.6.5).
  booking_cancelled_by_trainer: ({ t, locale, timeZone, payload }) => {
    const dates = (Array.isArray(payload.dates) ? payload.dates : []).filter((date): date is string => typeof date === "string");
    const shown = dates.slice(0, MAX_DATES).map((date) => sessionTime(locale, date, timeZone));
    if (dates.length > MAX_DATES) shown.push(interpolate(t.moreDates, { count: dates.length - MAX_DATES }));
    return {
      text: interpolateEscaped(dates.length > 1 ? t.sessionsCancelled : t.sessionCancelled, {
        name: personName(payload) || t.sessionTrainer,
        dates: shown.join("; "),
        reason: String(payload.reason ?? ""),
      }),
      buttons: [{ text: t.openSessions, path: "/client/sessions" }],
    };
  },
  // Т1: payload { booking_id, session_id, starts_at, mode, location, debt, first_name, last_name } from book_slot,
  // a booking confirmed at once by a pass or allowed debt (PRD 2.6.4-2).
  booking_created: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(payload.debt === true ? t.bookingCreatedDebt : t.bookingCreated, {
      name: personName(payload) || t.unnamedClient,
      when: sessionTime(locale, payload.starts_at, timeZone),
      place: place(t, payload),
    }),
    buttons: [{ text: t.openSession, path: idPath("/trainer/sessions", payload.session_id, "/trainer/schedule") }],
  }),
  // Т2: the same payload for a request; the button opens it to confirm or decline (PRD 2.6.4).
  booking_requested: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(t.bookingRequested, {
      name: personName(payload) || t.unnamedClient,
      when: sessionTime(locale, payload.starts_at, timeZone),
      place: place(t, payload),
    }),
    buttons: [{ text: t.answerRequest, path: idPath("/trainer/requests", payload.booking_id, "/trainer/requests") }],
  }),
  // Т3: payload { booking_id, session_id, starts_at, request, first_name, last_name }; request = a request taken back.
  booking_cancelled_by_client: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(payload.request === true ? t.requestWithdrawn : t.bookingCancelledByClient, {
      name: personName(payload) || t.unnamedClient,
      when: sessionTime(locale, payload.starts_at, timeZone),
    }),
    buttons: [{ text: t.openSchedule, path: "/trainer/schedule" }],
  }),
  // К2, К3: payload { booking_id, session_id, starts_at, reason, first_name, last_name } from decide_booking.
  booking_confirmed: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(t.requestConfirmed, {
      name: personName(payload) || t.sessionTrainer,
      when: sessionTime(locale, payload.starts_at, timeZone),
    }),
    buttons: [{ text: t.openBooking, path: idPath("/client/bookings", payload.booking_id, "/client/sessions") }],
  }),
  booking_declined: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(typeof payload.reason === "string" && payload.reason.trim() ? t.requestDeclinedReason : t.requestDeclined, {
      name: personName(payload) || t.sessionTrainer,
      when: sessionTime(locale, payload.starts_at, timeZone),
      reason: typeof payload.reason === "string" ? payload.reason.trim() : "",
    }),
    buttons: [{ text: t.bookAgain, path: "/client/book" }],
  }),
  // К4: payload { booking_id, session_id, starts_at, first_name, last_name } from the expiry job (PRD 2.6.4-5).
  booking_expired: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(t.requestExpired, {
      name: personName(payload) || t.sessionTrainer,
      when: sessionTime(locale, payload.starts_at, timeZone),
    }),
    buttons: [{ text: t.bookAgain, path: "/client/book" }],
  }),
};

/** A cancelled repeat lists this many dates, then "and N more". */
const MAX_DATES = 5;

/** "пн, 26 октября в 18:00" in the recipient's zone (PRD 2.6.7-4). */
function sessionTime(locale: Locale, value: Json | undefined, timeZone: string | null): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" };
  const format = (zone: string) => new Intl.DateTimeFormat(INTL_LOCALE[locale], { ...options, timeZone: zone }).format(date);
  try {
    return format(timeZone ?? DEFAULT_TIME_ZONE);
  } catch {
    return format(DEFAULT_TIME_ZONE);
  }
}

/** Where a session happens: the trainer's place by name, or in person or online. */
function place(t: TemplateContext["t"], payload: TemplateContext["payload"]): string {
  if (payload.mode === "online") return t.placeOnline;
  return typeof payload.location === "string" && payload.location.trim() ? payload.location.trim() : t.placeOffline;
}

/** "Pro" or "Premium": the same word in every language, from the plan code in the payload. */
function planName(payload: TemplateContext["payload"]): string {
  return isPlanCode(payload.plan) ? dictionaries.ru.plans.names[payload.plan] : String(payload.plan ?? "");
}

/** Fills {placeholders} in a catalog string, escaping the template and every value. */
function interpolateEscaped(template: string, values: Record<string, string | number>): string {
  return interpolate(
    escapeHtml(template),
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(String(value))])),
  );
}

/** К8 and К9: what happened to which session, and what is left on the pass or owed. */
function chargeMessage({ t, locale, timeZone, payload }: TemplateContext, kind: "posted" | "waived") {
  const passId = typeof payload.pass_id === "string" && isPairId(payload.pass_id) ? payload.pass_id : null;
  const debtCount = Number(payload.debt_sessions ?? 0);
  const values = {
    name: personName(payload) || t.unnamedTrainer,
    when: typeof payload.starts_at === "string" ? formatSessionTime(locale, payload.starts_at, timeZone ?? DEFAULT_TIME_ZONE) : "",
    pass: typeof payload.pass_title === "string" ? payload.pass_title : "",
    remaining: Number(payload.remaining ?? 0),
    debt: plural(locale, debtCount, dictionaries[locale].pairs.debtSessions),
  };
  const late = payload.reason === "late_cancel";
  const template =
    kind === "waived"
      ? passId
        ? t.chargeWaived
        : debtCount > 0
          ? t.chargeWaivedDebt
          : t.chargeWaivedNoDebt
      : passId
        ? late
          ? t.chargeLateCancel
          : t.chargeNoShow
        : late
          ? t.chargeLateCancelDebt
          : t.chargeNoShowDebt;
  return {
    text: interpolateEscaped(template, values),
    buttons: [{ text: t.openPass, path: passId ? `/client/passes/${passId}` : "/client/passes" }],
  };
}

/** The person's name from the payload the RPC queued; empty when there is none. */
function personName(payload: TemplateContext["payload"]): string {
  const part = (value: Json | undefined) => (typeof value === "string" ? value.trim() : "");
  return [part(payload.first_name), part(payload.last_name)].filter(Boolean).join(" ");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The pair's card under `base`, or `base` itself when the payload has no valid pair id. */
function pairPath(base: string, payload: TemplateContext["payload"]): string {
  return typeof payload.coaching_id === "string" && UUID.test(payload.coaching_id) ? `${base}/${payload.coaching_id}` : base;
}

/** The pair's intake under `base`, or `base` itself when the payload has no valid pair id. */
function intakePath(base: string, payload: TemplateContext["payload"]): string {
  const pair = pairPath(base, payload);
  return pair === base ? base : `${pair}/intake`;
}

/** `${base}/${id}` for a valid id in the payload, else `fallback`. */
function idPath(base: string, id: Json | undefined, fallback: string): string {
  return typeof id === "string" && UUID.test(id) ? `${base}/${id}` : fallback;
}

/** Escapes text for parse_mode HTML. Templates pass catalog strings and every inserted value through it. */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Builds the message for one claimed row. Buttons open the app route with ?source=<type>, the mark the beta
 * metrics count (PRD wave 1, "Клиенты открывают из напоминаний"). In a private chat they open the Mini App
 * (web_app); groups do not allow web_app buttons, so there they are plain links. Telegram accepts only https
 * buttons, so a local http app URL gets none.
 */
export function renderMessage(
  row: { kind: NotificationType; locale: Locale; time_zone: string | null; payload: Json },
  options: { appUrl: string; group: boolean },
): { text: string; buttons: InlineButton[] } | null {
  const template = templates[row.kind];
  if (!template) return null;
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
  const rendered = template({ t: dictionaries[row.locale].botMessages, locale: row.locale, timeZone: row.time_zone, payload });
  const buttons = new URL(options.appUrl).protocol === "https:" ? rendered.buttons : [];
  return {
    text: rendered.text,
    buttons: buttons.map(({ text, path }) => {
      const url = new URL(path, options.appUrl);
      url.searchParams.set("source", row.kind);
      return options.group ? { text, url: url.toString() } : { text, web_app: { url: url.toString() } };
    }),
  };
}
