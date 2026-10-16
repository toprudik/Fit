import type { Locale } from "@/i18n/config";
import { dictionaries, type Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
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
  // Т7 and Т7a. The client screen arrives with the pair card; until then the button opens the list.
  coaching_created: ({ t, payload }) => ({
    text: interpolateEscaped(t.newClient, { name: clientName(t, payload) }),
    buttons: [{ text: t.openClients, path: "/trainer/clients" }],
  }),
  managed_client_claim: ({ t, payload }) => ({
    text: interpolateEscaped(t.newClientWithCards, { name: clientName(t, payload) }),
    buttons: [{ text: t.openClients, path: "/trainer/clients" }],
  }),
  // Т8: payload { coaching_id, first_name, last_name, parq_flagged } from the intakes trigger.
  intake_submitted: ({ t, payload }) => ({
    text: interpolateEscaped(payload.parq_flagged === true ? t.intakeSubmittedFlagged : t.intakeSubmitted, {
      name: clientName(t, payload),
    }),
    buttons: [{ text: t.openIntake, path: `/trainer/clients/${pairId(payload)}/intake` }],
  }),
  // "Напомнить": payload { coaching_id, first_name, last_name } of the trainer, from remind_intake.
  intake_reminder: ({ t, payload }) => ({
    text: interpolateEscaped(t.intakeReminder, { name: personName(payload) || t.unnamedTrainer }),
    buttons: [{ text: t.fillIntake, path: `/client/trainers/${pairId(payload)}/intake` }],
  }),
};

/** Fills {placeholders} in a catalog string, escaping the template and every value. */
function interpolateEscaped(template: string, values: Record<string, string | number>): string {
  return interpolate(
    escapeHtml(template),
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(String(value))])),
  );
}

/** The client's name from the payload the join RPC queued, or a neutral stand-in. */
function clientName(t: Dictionary["botMessages"], payload: TemplateContext["payload"]): string {
  return personName(payload) || t.unnamedClient;
}

/** first_name and last_name of a payload, or an empty string. */
function personName(payload: TemplateContext["payload"]): string {
  const part = (value: Json | undefined) => (typeof value === "string" ? value.trim() : "");
  return [part(payload.first_name), part(payload.last_name)].filter(Boolean).join(" ");
}

/** The pair id of a payload for a route segment; the database writes a uuid there. */
function pairId(payload: TemplateContext["payload"]): string {
  return encodeURIComponent(String(payload.coaching_id ?? ""));
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
