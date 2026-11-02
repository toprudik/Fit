import { escapeHtml } from "@/lib/notifications/messages";
import type { OutgoingMessage, SendResult } from "@/lib/notifications/telegram";

/**
 * Error alerts in the team's Telegram chat (ADR 0017). The free Sentry plan alerts by email only, so the cron route
 * reads the issues Sentry first saw in the last day and posts each new one once. A message carries the error type,
 * where it happened, how often and the link to the issue: never the error's text, which can quote a person's input.
 */

/** The fields of a Sentry issue this module reads (GET /api/0/organizations/{org}/issues/). */
export type SentryIssue = {
  id: string;
  shortId?: string;
  culprit?: string | null;
  permalink?: string;
  level?: string;
  count?: string | number;
  firstSeen?: string;
  metadata?: { type?: string | null; function?: string | null; filename?: string | null } | null;
  project?: { slug?: string } | null;
};

export type ErrorAlertDeps = {
  fetchIssues: () => Promise<SentryIssue[]>;
  /** Records the ids and returns those never posted before (public.claim_error_alerts). */
  claim: (ids: string[]) => Promise<string[]>;
  send: (message: OutgoingMessage) => Promise<SendResult>;
  chatId: number;
};

export type ErrorAlertSummary = { issues: number; posted: number; failed: number };

/** At most this many messages per run; the rest of a burst is summed up in one more line. */
export const MAX_MESSAGES = 5;
const SENTRY_API = "https://sentry.io/api/0";

export async function fetchNewSentryIssues(org: string, token: string, fetcher: typeof fetch = fetch): Promise<SentryIssue[]> {
  const url = `${SENTRY_API}/organizations/${encodeURIComponent(org)}/issues/?query=is%3Aunresolved&statsPeriod=24h&sort=new&limit=25`;
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`sentry issues: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("sentry issues: unexpected answer");
  return body.filter((issue): issue is SentryIssue => typeof issue?.id === "string" && /^\d{1,20}$/.test(issue.id));
}

const PROJECT_NAMES: Record<string, string> = { "dafit-web": "сайт", "dafit-bot": "бот" };

/** One line, cut when long and escaped for the Bot API's HTML mode. */
function clean(value: string | null | undefined, max = 120): string {
  const text = (value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return escapeHtml(text.length > max ? `${text.slice(0, max - 1)}…` : text);
}

/** Sentry's permalink, kept only when it points to sentry.io. */
function issueLink(issue: SentryIssue): string | null {
  try {
    const url = new URL(issue.permalink ?? "");
    return url.protocol === "https:" && (url.hostname === "sentry.io" || url.hostname.endsWith(".sentry.io")) ? url.href : null;
  } catch {
    return null;
  }
}

export function renderErrorAlert(issue: SentryIssue): string {
  const slug = issue.project?.slug ?? "";
  const where = PROJECT_NAMES[slug] ?? clean(slug, 40);
  const type = clean(issue.metadata?.type, 80) || "Ошибка";
  const place = clean(issue.culprit) || clean(issue.metadata?.function) || clean(issue.metadata?.filename);
  const count = Number(issue.count);
  const link = issueLink(issue);
  const lines = [
    `Новая ошибка${where ? ` (${where})` : ""}: ${type}`,
    place ? `Где: ${place}` : null,
    Number.isFinite(count) && count > 1 ? `Случаев: ${count}` : null,
    link ? escapeHtml(link) : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/** One run: new issues go to the team chat, at most MAX_MESSAGES of them plus a line for the rest. */
export async function postErrorAlerts(deps: ErrorAlertDeps): Promise<ErrorAlertSummary> {
  const issues = await deps.fetchIssues();
  const summary: ErrorAlertSummary = { issues: issues.length, posted: 0, failed: 0 };
  if (issues.length === 0) return summary;
  const fresh = new Set(await deps.claim(issues.map((issue) => issue.id)));
  const toPost = issues.filter((issue) => fresh.has(issue.id));

  const texts = toPost.slice(0, MAX_MESSAGES).map(renderErrorAlert);
  const rest = toPost.length - MAX_MESSAGES;
  if (rest > 0) texts.push(`И ещё новых ошибок: ${rest}. Все они в Sentry, раздел Issues.`);

  for (const text of texts) {
    const result = await deps.send({ chatId: deps.chatId, text, silent: false, buttons: [] });
    if (result.ok) summary.posted += 1;
    else summary.failed += 1;
  }
  return summary;
}
