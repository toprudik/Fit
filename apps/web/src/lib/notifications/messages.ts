import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { dictionaries, type Dictionary } from "@/i18n/dictionaries";
import { interpolate, plural, type PluralForms } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import { isPairId } from "@/lib/pairs/clients";
import { formatSessionTime } from "@/lib/pairs/format";
import { DEFAULT_TIME_ZONE, formatPlanDate, isPlanCode } from "@/lib/plans/plans";
import { isButtonUrl } from "@/lib/groups/rules";
import { isBadgeCode } from "@/lib/gamification/gamification";
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

/**
 * A button opens an app route (path), which the dispatcher turns into a Mini App or a link button, or an outside
 * https address (href) the trainer put in a broadcast.
 */
type TemplateButton = { text: string; path: string } | { text: string; href: string };
type Template = (context: TemplateContext) => { text: string; buttons: TemplateButton[] };

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
  // А2 to the admin group: payload { feedback_id, kind, zone, excerpt, screenshots } from the feedback trigger.
  // The author stays out of the group; /admin/feedback shows who wrote it.
  feedback_received: ({ t, locale, payload }) => {
    const kind = t.feedbackKinds[payload.kind as keyof typeof t.feedbackKinds] ?? t.feedbackKinds.other;
    const zone = t.feedbackZones[payload.zone as keyof typeof t.feedbackZones] ?? t.feedbackZones.none;
    const screenshots = Number(payload.screenshots ?? 0);
    const text = interpolateEscaped(t.feedbackReceived, { kind, zone, excerpt: String(payload.excerpt ?? "") });
    const id = typeof payload.feedback_id === "string" && isPairId(payload.feedback_id) ? payload.feedback_id : null;
    return {
      text: screenshots > 0 ? `${text}\n${escapeHtml(plural(locale, screenshots, t.feedbackScreenshots))}` : text,
      buttons: [{ text: t.openFeedback, path: id ? `/admin/feedback/${id}` : "/admin/feedback" }],
    };
  },
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
  // С1: payload { request_id, coaching_id, side, first_name, last_name } from request_contact, side being the
  // requester's. Both buttons open the answer screen, where sharing goes through Telegram's own popup (PRIV-2).
  contact_request: ({ t, payload }) => {
    const trainer = payload.side === "trainer";
    const path = idPath("/contact", payload.request_id, "/");
    return {
      text: interpolateEscaped(trainer ? t.contactRequestTrainer : t.contactRequestClient, {
        name: personName(payload) || (trainer ? t.unnamedTrainer : t.unnamedClient),
      }),
      buttons: [
        { text: t.shareContact, path },
        { text: t.declineContact, path },
      ],
    };
  },
  // С2: payload { request_id, coaching_id, side, accepted, first_name, last_name, phone?, telegram_id? } from the
  // answer RPCs, side being the requester's. On consent the name links to the person's Telegram chat; the phone
  // number is the one Telegram signed.
  contact_response: ({ t, payload }) => {
    const trainer = payload.side === "trainer";
    const name = personName(payload) || (trainer ? t.unnamedClient : t.unnamedTrainer);
    const button = trainer
      ? { text: t.openClient, path: pairPath("/trainer/clients", payload) }
      : { text: t.openTrainer, path: pairPath("/client/trainers", payload) };
    const phone = typeof payload.phone === "string" ? payload.phone : "";
    if (payload.accepted !== true || !phone) {
      return { text: interpolateEscaped(t.contactDeclined, { name }), buttons: [button] };
    }
    const id = payload.telegram_id;
    const link =
      typeof id === "number" && Number.isSafeInteger(id) ? `<a href="tg://user?id=${id}">${escapeHtml(name)}</a>` : escapeHtml(name);
    return { text: interpolate(escapeHtml(t.contactShared), { name: link, phone: escapeHtml(phone) }), buttons: [button] };
  },
  // Wave-3 §2.2-7: payload { badge } from private.award_badges, the code of the new badge. Its title and text
  // come from the recipient's dictionary.
  badge: ({ t, locale, payload }) => {
    const items = dictionaries[locale].gamification.badges.items;
    const item = isBadgeCode(payload.badge) ? items[payload.badge] : null;
    return {
      text: item ? interpolateEscaped(t.badge, { title: item.title, text: item.text }) : escapeHtml(t.badgeUnknown),
      buttons: [{ text: t.openBadges, path: "/client/progress/badges" }],
    };
  },
  // Д1: payload { coaching_id, homework_id, title, first_name, last_name } from queue_homework_reminders, the
  // trainer's name.
  homework_reminder: ({ t, payload }) => ({
    text: interpolateEscaped(t.homeworkReminder, {
      title: String(payload.title ?? ""),
      name: personName(payload) || t.unnamedTrainer,
    }),
    buttons: [{ text: t.openHomework, path: "/client/sessions/homework" }],
  }),
  // Д2: payload { coaching_id, homework_id, title, name, comment? } from mark_homework_done, name being the
  // client as the trainer calls them.
  homework_done: ({ t, payload }) => {
    const text = interpolateEscaped(t.homeworkDone, {
      name: String(payload.name ?? "") || t.unnamedClient,
      title: String(payload.title ?? ""),
    });
    const comment = typeof payload.comment === "string" && payload.comment ? payload.comment : null;
    const pair = pairPath("/trainer/clients", payload);
    return {
      text: comment ? `${text}\n${interpolateEscaped(t.homeworkComment, { comment })}` : text,
      buttons: [
        {
          text: t.openHomework,
          path: pair === "/trainer/clients" ? pair : idPath(`${pair}/workouts/homework`, payload.homework_id, `${pair}/workouts`),
        },
      ],
    };
  },
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
          path:
            typeof payload.coaching_id === "string" && isPairId(payload.coaching_id)
              ? `/trainer/clients/${payload.coaching_id}/payments`
              : "/trainer/money",
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
  // Account deletion (PRIV-7): payload { stage: requested, scheduled_for } or { stage: cancelled }.
  account_deletion: ({ t, locale, timeZone, payload }) =>
    payload.stage === "cancelled"
      ? { text: escapeHtml(t.deletionCancelled), buttons: [{ text: t.open, path: "/" }] }
      : {
          text: interpolateEscaped(t.deletionRequested, { date: planDate(locale, payload.scheduled_for, timeZone) }),
          buttons: [{ text: t.cancelDeletion, path: "/settings/delete" }],
        },
  // The other side of a live pair asked to delete the account: payload { coaching_id, side, first_name,
  // last_name, cancelled, scheduled_for } from request_account_deletion. side names the one leaving.
  counterpart_deleting: ({ t, locale, timeZone, payload }) => {
    if (payload.side === "trainer") {
      return {
        text: interpolateEscaped(t.trainerDeleting, { name: personName(payload) || t.unnamedTrainer }),
        buttons: [{ text: t.openTrainer, path: pairPath("/client/trainers", payload) }],
      };
    }
    const cancelled = Number(payload.cancelled ?? 0);
    return {
      text: interpolateEscaped(cancelled > 0 ? t.clientDeletingCancelled : t.clientDeleting, {
        name: personName(payload) || t.unnamedClient,
        count: cancelled,
        date: planDate(locale, payload.scheduled_for, timeZone),
      }),
      buttons: [{ text: t.openClient, path: pairPath("/trainer/clients", payload) }],
    };
  },
  // PRIV-6: payload { export_id, expires_at } from complete_data_export. The link itself is signed on the
  // export screen, so the chat never holds a working download URL.
  export_ready: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(t.exportReady, { date: planDate(locale, payload.expires_at, timeZone) }),
    buttons: [{ text: t.downloadExport, path: "/settings/export" }],
  }),
  // Wave-2 §1.3: payload { coaching_id, goal, previous_goal, first_name, last_name } from set_client_goal, to a
  // trainer whose own target is active; that target does not follow the goal.
  goal_changed: ({ t, payload }) => {
    // The payload comes from the enum, so an unknown goal is not expected; it would show as is.
    const goal = payload.goal === "lose" || payload.goal === "maintain" || payload.goal === "gain" ? t.goalNames[payload.goal] : String(payload.goal ?? "");
    const pair = pairPath("/trainer/clients", payload);
    return {
      text: interpolateEscaped(t.goalChanged, { name: personName(payload) || t.unnamedClient, goal }),
      buttons: [{ text: t.openNutrition, path: pair === "/trainer/clients" ? pair : `${pair}/nutrition` }],
    };
  },
  // Wave-3 §1: payload { event, delegation_id, coaching_id, session_id, starts_at, delegate_name, owner_name } from
  // accept_delegation, decline_delegation and the two-hour reminder of an unaccepted substitute.
  delegation: ({ t, locale, timeZone, payload }) => {
    const delegate = typeof payload.delegate_name === "string" && payload.delegate_name.trim() ? payload.delegate_name.trim() : t.unnamedTrainer;
    const owner = typeof payload.owner_name === "string" && payload.owner_name.trim() ? payload.owner_name.trim() : t.unnamedTrainer;
    const when = sessionTime(locale, payload.starts_at, timeZone);
    const team = [{ text: t.openTeam, path: "/trainer/team" }];
    switch (payload.event) {
      case "substitute":
        return { text: interpolateEscaped(t.delegationSubstitute, { delegate, when }), buttons: [{ text: t.openSessions, path: "/client/sessions" }] };
      case "assistant": {
        const pair = pairPath("/client/trainers", payload);
        return {
          text: interpolateEscaped(t.delegationAssistant, { owner, delegate }),
          buttons: [{ text: t.openAccess, path: pair === "/client/trainers" ? pair : `${pair}/sharing` }],
        };
      }
      case "accepted":
        return {
          text: payload.kind === "assistant" ? interpolateEscaped(t.delegationAssistantAccepted, { delegate }) : interpolateEscaped(t.delegationAccepted, { delegate, when }),
          buttons: team,
        };
      case "pending":
        return { text: interpolateEscaped(t.delegationPending, { when }), buttons: team };
      default:
        return { text: escapeHtml(t.delegationDeclined), buttons: team };
    }
  },
  // Wave-2 §6.9: payload { broadcast_id, coaching_id, trainer_name, body, button_kind, button_url } from
  // send_broadcast. The trainer's text goes out as typed, escaped; a link button takes https only.
  trainer_broadcast: ({ t, payload }) => {
    const name = String(payload.trainer_name ?? "").trim();
    const heading = `<b>${interpolateEscaped(t.broadcastFrom, { name: name || t.unnamedTrainer })}</b>`;
    const url = typeof payload.button_url === "string" && isButtonUrl(payload.button_url) ? payload.button_url : null;
    const buttons: TemplateButton[] =
      payload.button_kind === "deep_link"
        ? [{ text: t.open, path: "/client" }]
        : payload.button_kind === "url" && url
          ? [{ text: t.broadcastLink, href: url }]
          : [];
    return { text: `${heading}\n${escapeHtml(String(payload.body ?? ""))}`, buttons };
  },
  // Wave-2 §3.12: payload { comment_id, day, body, first_name, last_name, display_name } from add_food_comment;
  // the button opens that day of the client's food diary (§3.7 acceptance).
  trainer_comment: ({ t, locale, payload }) => {
    const day = typeof payload.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.day) ? payload.day : null;
    const name = (typeof payload.display_name === "string" && payload.display_name.trim()) || personName(payload) || t.unnamedTrainer;
    return {
      text: interpolateEscaped(t.trainerComment, {
        name,
        date: day ? diaryDay(locale, day) : "",
        body: typeof payload.body === "string" ? payload.body : "",
      }),
      buttons: [{ text: t.openFoodDay, path: day ? `/client/diary/food?day=${day}` : "/client/diary/food" }],
    };
  },
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
  // К-referral: payload { pass_id, sessions, side, friend, trainer } from private.grant_referral_bonus (PRD wave-3 §3.1-6);
  // side is referrer (the client who shared the link) or referee (the friend), friend and trainer are names.
  referral_bonus: ({ t, locale, payload }) => {
    const passId = typeof payload.pass_id === "string" && isPairId(payload.pass_id) ? payload.pass_id : null;
    return {
      text: interpolateEscaped(payload.side === "referee" ? t.referralBonusReferee : t.referralBonusReferrer, {
        friend: personName(nested(payload.friend)) || t.unnamedClient,
        trainer: personName(nested(payload.trainer)) || t.unnamedTrainer,
        sessions: plural(locale, Number(payload.sessions ?? 0), t.referralSessions),
      }),
      buttons: [{ text: t.openPass, path: passId ? `/client/passes/${passId}` : "/client/passes" }],
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
  // Т2: the same payload for a request, with trial = a trial request; the button opens it to confirm or decline (PRD 2.6.4, 2.3-5).
  // A move that became a request carries rescheduled_from, the old start (PRD 2.6.5); on_site = asked at a QR
  // check-in without a booking (PRD wave-3 §5 rule 6).
  booking_requested: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(
      payload.trial === true
        ? t.trialRequested
        : typeof payload.rescheduled_from === "string"
          ? t.rescheduleRequested
          : payload.on_site === true
            ? t.bookingRequestedOnSite
            : t.bookingRequested,
      {
        name: personName(payload) || t.unnamedClient,
        when: sessionTime(locale, payload.starts_at, timeZone),
        from: sessionTime(locale, payload.rescheduled_from, timeZone),
        place: place(t, payload),
      },
    ),
    buttons: [{ text: t.answerRequest, path: idPath("/trainer/requests", payload.booking_id, "/trainer/requests") }],
  }),
  // Т3: payload { booking_id, session_id, starts_at, request, late, reason, first_name, last_name }; request = a
  // request taken back, late = cancelled after the deadline with a charge (PRD 2.6.5).
  booking_cancelled_by_client: ({ t, locale, timeZone, payload }) => {
    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    const lines = [
      interpolateEscaped(
        payload.request === true ? t.requestWithdrawn : payload.late === true ? t.bookingCancelledLate : t.bookingCancelledByClient,
        { name: personName(payload) || t.unnamedClient, when: sessionTime(locale, payload.starts_at, timeZone) },
      ),
      reason ? interpolateEscaped(t.cancelReasonLine, { reason }) : null,
    ];
    // A late cancellation is charged: "Простить" opens the waiver of the session page (screens.md §4.3).
    const late = payload.request !== true && payload.late === true && isPairId(payload.booking_id) && isPairId(payload.session_id);
    return {
      text: lines.filter(Boolean).join("\n"),
      buttons: late
        ? [{ text: t.waiveCharge, path: `/trainer/sessions/${payload.session_id}?action=waive&booking=${payload.booking_id}` }]
        : [{ text: t.openSchedule, path: "/trainer/schedule" }],
    };
  },
  // Т4: booking_created's payload with rescheduled_from, the old start; reschedule_my_booking turns Т1 into it.
  booking_rescheduled: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(payload.debt === true ? t.bookingRescheduledDebt : t.bookingRescheduled, {
      name: personName(payload) || t.unnamedClient,
      from: sessionTime(locale, payload.rescheduled_from, timeZone),
      when: sessionTime(locale, payload.starts_at, timeZone),
      place: place(t, payload),
    }),
    buttons: [{ text: t.openSession, path: idPath("/trainer/sessions", payload.session_id, "/trainer/schedule") }],
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
  // К-лист: payload { entry_id, session_id, title, starts_at, mode, location, expires_at, first_name, last_name } from
  // private.waitlist_offer_next or trainer_offer_waitlist; sent in quiet hours too, since it lasts minutes.
  waitlist_offer: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(t.waitlistOffer, {
      title: typeof payload.title === "string" ? payload.title : "",
      name: personName(payload) || t.sessionTrainer,
      when: sessionTime(locale, payload.starts_at, timeZone),
      place: place(t, payload),
      until: clockTime(locale, payload.expires_at, timeZone),
    }),
    buttons: [{ text: t.answerOffer, path: idPath("/client/waitlist", payload.entry_id, "/client/book") }],
  }),
  // payload { entry_id, session_id, reason: started | cancelled, title, starts_at, first_name, last_name } from
  // private.waitlist_close (PRD wave-2 §9 rule 8).
  waitlist_closed: ({ t, locale, timeZone, payload }) => ({
    text: interpolateEscaped(payload.reason === "cancelled" ? t.waitlistCancelled : t.waitlistClosed, {
      title: typeof payload.title === "string" ? payload.title : "",
      name: personName(payload) || t.sessionTrainer,
      when: sessionTime(locale, payload.starts_at, timeZone),
    }),
    buttons: [{ text: t.bookAgain, path: "/client/book" }],
  }),
};

/** "18:30" in the recipient's zone. */
function clockTime(locale: Locale, value: Json | undefined, timeZone: string | null): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  const format = (zone: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(date);
  try {
    return format(timeZone ?? DEFAULT_TIME_ZONE);
  } catch {
    return format(DEFAULT_TIME_ZONE);
  }
}

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

/** A date like "16 ноября 2026" in the recipient's zone; empty when the payload has none. */
function planDate(locale: Locale, value: Json | undefined, timeZone: string | null): string {
  return typeof value === "string" ? formatPlanDate(locale, value, timeZone) : "";
}

/** "17 октября": a diary day (YYYY-MM-DD) is a calendar date, so no time zone moves it. */
function diaryDay(locale: Locale, day: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
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

/** A nested object of the payload, such as a person from private.person_name; empty for anything else. */
function nested(value: Json | undefined): TemplateContext["payload"] {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
    buttons: buttons.map((button) => {
      if ("href" in button) return { text: button.text, url: button.href };
      const url = new URL(button.path, options.appUrl);
      url.searchParams.set("source", row.kind);
      return options.group ? { text: button.text, url: url.toString() } : { text: button.text, web_app: { url: url.toString() } };
    }),
  };
}
