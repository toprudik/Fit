import { describe, expect, it } from "vitest";
import { parseBotAction } from "@/lib/bot-actions/callback-data";
import { Constants, type Json } from "@/lib/supabase/database.types";
import { renderMessage, type NotificationType } from "./messages";
import type { InlineButton } from "./telegram";

/*
 * Every notification type against what Telegram and the bot accept, whatever the payload: the rules of
 * sendMessage (text length, parse_mode HTML, button kinds), the bot's callback prefixes
 * (apps/bot/src/fit_bot/handlers/actions.py) and the source mark the beta metrics count. The per-template tests in
 * messages.test.ts check the wording; these check that no payload breaks a message.
 */

const APP_URL = "https://fit.example";
const TYPES = Constants.public.Enums.notification_type;
const LOCALES = ["ru", "en"] as const;

/** Types queued without a template yet: their rows fail with no_template (messages.ts). Shrinks as templates land. */
const WITHOUT_TEMPLATE: NotificationType[] = ["pass_expired", "review_reply"];

/** Text a person typed or a name: markup that must reach Telegram escaped. */
const HOSTILE = `<script>alert(1)</script> & "Ann" <b>bold</b>`;
const UUID = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const NUMBERS = new Set([
  "amount_minor",
  "count",
  "documents",
  "remaining",
  "offset_min",
  "sessions_count",
  "requests_count",
  "passes_count",
  "debts_count",
  "debt_sessions",
  "telegram_id",
  "cancelled",
  "screenshots",
  "debt",
  "waiting",
  "sessions",
  "passes",
  "debts",
]);
const TIMESTAMPS = new Set(["starts_at", "expires_at", "scheduled_for", "rescheduled_from", "before_starts_at"]);
const DATES = new Set(["starts_on", "ends_on", "day", "until"]);
const BOOLEANS = new Set(["late", "trial", "on_site", "parq_flagged", "hidden", "booking_only", "accepted", "applied", "available", "pay", "friend"]);

/** A payload with a value of the expected type under every key a template may read; strings are hostile. */
function typedPayload(): Record<string, Json> {
  return new Proxy({} as Record<string, Json>, {
    get(_target, key) {
      if (typeof key !== "string") return undefined;
      if (key.endsWith("_id") || key === "token") return UUID;
      if (NUMBERS.has(key)) return 3;
      if (TIMESTAMPS.has(key)) return "2026-11-02T09:00:00Z";
      if (DATES.has(key)) return "2026-11-02";
      if (key === "month") return "2026-10-01";
      if (BOOLEANS.has(key)) return true;
      if (key.endsWith("_url")) return "https://pay.example/link";
      if (key === "username") return "trainer_name";
      if (key === "currency") return "RUB";
      return HOSTILE;
    },
  });
}

/**
 * Every key a hostile string, numbers and dates included. A template may throw on a date it can't read; the
 * dispatcher then fails that row alone (dispatch.test.ts). What it renders must still be safe to send.
 */
function hostilePayload(): Record<string, Json> {
  return new Proxy({} as Record<string, Json>, { get: (_target, key) => (typeof key === "string" ? HOSTILE : undefined) });
}

const PAYLOADS = { empty: () => ({}), typed: typedPayload, hostile: hostilePayload } as const;

/** Tags Telegram's parse_mode HTML takes that the templates use. */
const ALLOWED_TAG = /^<\/?(b|i|u|s|code|pre|blockquote)>$|^<a href="(https:\/\/[^"]+|tg:\/\/user\?id=\d+)">$|^<\/a>$/;

function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&");
}

function checkHtml(text: string) {
  const stack: string[] = [];
  for (const tag of text.match(/<[^>]*>/g) ?? []) {
    expect(tag, `tag ${tag}`).toMatch(ALLOWED_TAG);
    const name = /^<\/?([a-z]+)/.exec(tag)?.[1] ?? "";
    if (tag.startsWith("</")) expect(stack.pop(), `closing ${tag}`).toBe(name);
    else stack.push(name);
  }
  expect(stack, "unclosed tags").toEqual([]);
  // Outside tags no raw < or >, and every & starts an entity.
  const outside = text.replace(/<[^>]*>/g, "");
  expect(outside).not.toMatch(/[<>]/);
  expect(outside).not.toMatch(/&(?!(amp|lt|gt|quot);)/);
}

function checkButtons(kind: NotificationType, buttons: InlineButton[], group: boolean) {
  expect(buttons.length).toBeLessThanOrEqual(8);
  for (const button of buttons) {
    expect(button.text.trim().length, "button text").toBeGreaterThan(0);
    expect(button.text.length).toBeLessThanOrEqual(64);
    expect(button.text).not.toMatch(/undefined|NaN|\[object/);
    if ("callback_data" in button) {
      expect(group, "action buttons stay out of groups").toBe(false);
      expect(new TextEncoder().encode(button.callback_data).length).toBeLessThanOrEqual(64);
      // The bot forwards only these prefixes (ACTION_DATA in apps/bot/src/fit_bot/handlers/actions.py).
      expect(button.callback_data).toMatch(/^((bk|mc)[yn]|ctn):/);
      expect(parseBotAction(button.callback_data)).not.toBeNull();
    } else if ("web_app" in button) {
      expect(group, "groups take no Mini App buttons").toBe(false);
      checkAppUrl(kind, button.web_app.url);
    } else {
      const url = new URL(button.url);
      expect(url.protocol).toBe("https:");
      if (url.origin === APP_URL) checkAppUrl(kind, button.url);
    }
  }
}

function checkAppUrl(kind: NotificationType, href: string) {
  const url = new URL(href);
  expect(url.origin).toBe(APP_URL);
  expect(url.searchParams.get("source")).toBe(kind);
  // The proxy adds the locale (ADR 0015); a link never carries it.
  expect(url.pathname).not.toMatch(/^\/(ru|en)(\/|$)/);
  expect(url.pathname).not.toMatch(/undefined|null|NaN|\/\//);
}

describe("every notification type", () => {
  it("has a template, except the ones listed as waiting for theirs", () => {
    const missing = TYPES.filter(
      (kind) => renderMessage({ kind, locale: "ru", time_zone: null, payload: {} }, { appUrl: APP_URL, group: false }) === null,
    );
    expect(missing).toEqual(WITHOUT_TEMPLATE);
  });

  describe.each(TYPES.filter((kind) => !WITHOUT_TEMPLATE.includes(kind)))("%s", (kind) => {
    it.each(
      LOCALES.flatMap((locale) =>
        (Object.keys(PAYLOADS) as (keyof typeof PAYLOADS)[]).flatMap((payload) =>
          [false, true].map((group) => ({ locale, payload, group })),
        ),
      ),
    )("$locale, $payload payload, group $group: a message Telegram accepts", ({ locale, payload, group }) => {
      const render = () =>
        renderMessage({ kind, locale, time_zone: "Asia/Yekaterinburg", payload: PAYLOADS[payload]() }, { appUrl: APP_URL, group });
      if (payload === "hostile") {
        try {
          render();
        } catch (error) {
          expect(error).toBeInstanceOf(RangeError);
          return;
        }
      }
      const message = render();
      expect(message).not.toBeNull();
      if (!message) return;
      const visible = visibleText(message.text);
      expect(visible.trim().length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThanOrEqual(4096);
      checkHtml(message.text);
      expect(message.text).not.toContain("<script");
      if (payload !== "hostile") expect(visible).not.toMatch(/undefined|NaN|Invalid Date|\[object/);
      checkButtons(kind, message.buttons, group);
    });

    it("speaks the recipient's language", () => {
      const ru = renderMessage({ kind, locale: "ru", time_zone: null, payload: typedPayload() }, { appUrl: APP_URL, group: false });
      const en = renderMessage({ kind, locale: "en", time_zone: null, payload: typedPayload() }, { appUrl: APP_URL, group: false });
      // Payload strings are Latin, so Cyrillic in English text is a string left untranslated.
      expect(ru?.text).toMatch(/[а-яё]/i);
      expect(visibleText(en?.text ?? "")).not.toMatch(/[а-яё]/i);
      for (const button of en?.buttons ?? []) expect(button.text).not.toMatch(/[а-яё]/i);
    });
  });

  it("gives a local http app URL no buttons, which Telegram would refuse", () => {
    for (const kind of TYPES) {
      const message = renderMessage({ kind, locale: "ru", time_zone: null, payload: typedPayload() }, { appUrl: "http://localhost:3000", group: false });
      expect(message?.buttons ?? []).toEqual([]);
    }
  });
});
