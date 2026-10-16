import type { Locale } from "@/i18n/config";
import { dictionaries, type Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { formatMoney } from "@/lib/money/format";
import { isPairId } from "@/lib/pairs/clients";
import { formatPlanDate, isPlanCode } from "@/lib/plans/plans";
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
};

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
