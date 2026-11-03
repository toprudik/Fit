import { describe, expect, it, vi } from "vitest";
import type { OutgoingMessage, SendResult } from "@/lib/notifications/telegram";
import { fetchNewSentryIssues, MAX_MESSAGES, postErrorAlerts, renderErrorAlert, type SentryIssue } from "./alerts";

vi.mock("server-only", () => ({}));

const issue = (id: string, extra: Partial<SentryIssue> = {}): SentryIssue => ({
  id,
  culprit: "app/[lang]/(app)/client/page.tsx",
  permalink: `https://dafit.sentry.io/issues/${id}/`,
  count: "3",
  metadata: { type: "TypeError", value: "Cannot read name of Anna" } as SentryIssue["metadata"],
  project: { slug: "dafit-web" },
  ...extra,
});

describe("renderErrorAlert", () => {
  it("names the type, the place, the count and the link, never the error's text", () => {
    const text = renderErrorAlert(issue("101", { title: "TypeError: Cannot read name of Anna" } as Partial<SentryIssue>));
    expect(text).toBe(
      "Новая ошибка (сайт): TypeError\nГде: app/[lang]/(app)/client/page.tsx\nСлучаев: 3\nhttps://dafit.sentry.io/issues/101/",
    );
    expect(text).not.toContain("Anna");
  });

  it("escapes HTML and drops a link that does not lead to Sentry", () => {
    const text = renderErrorAlert(
      issue("102", { culprit: "<b>x</b> & y", permalink: "https://evil.example/", project: { slug: "dafit-bot" }, count: 1 }),
    );
    expect(text).toBe("Новая ошибка (бот): TypeError\nГде: &lt;b&gt;x&lt;/b&gt; &amp; y");
  });

  it("falls back to a plain word when Sentry gives no type", () => {
    expect(renderErrorAlert({ id: "103" })).toBe("Новая ошибка: Ошибка");
  });
});

describe("postErrorAlerts", () => {
  const send = () => vi.fn<(message: OutgoingMessage) => Promise<SendResult>>(async () => ({ ok: true, messageId: 1 }));

  it("posts only the issues the database has not seen", async () => {
    const sent = send();
    const summary = await postErrorAlerts({
      fetchIssues: async () => [issue("1"), issue("2")],
      claim: async (ids) => ids.filter((id) => id === "2"),
      send: sent,
      chatId: -100,
    });
    expect(summary).toEqual({ issues: 2, posted: 1, failed: 0 });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({ chatId: -100, silent: false, buttons: [] });
    expect(sent.mock.calls[0][0].text).toContain("issues/2/");
  });

  it("does not touch the database when Sentry has nothing", async () => {
    const claim = vi.fn(async () => []);
    expect(await postErrorAlerts({ fetchIssues: async () => [], claim, send: send(), chatId: -100 })).toEqual({
      issues: 0,
      posted: 0,
      failed: 0,
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it("sums a burst up instead of flooding the chat", async () => {
    const sent = send();
    const many = Array.from({ length: MAX_MESSAGES + 3 }, (_, i) => issue(String(i + 1)));
    const summary = await postErrorAlerts({ fetchIssues: async () => many, claim: async (ids) => ids, send: sent, chatId: -100 });
    expect(sent).toHaveBeenCalledTimes(MAX_MESSAGES + 1);
    expect(sent.mock.calls.at(-1)?.[0]?.text).toBe("И ещё новых ошибок: 3. Все они в Sentry, раздел Issues.");
    expect(summary.posted).toBe(MAX_MESSAGES + 1);
  });

  it("counts a failed send", async () => {
    const summary = await postErrorAlerts({
      fetchIssues: async () => [issue("1")],
      claim: async (ids) => ids,
      send: async () => ({ ok: false, kind: "chat_unavailable", error: "telegram_403" }),
      chatId: -100,
    });
    expect(summary).toEqual({ issues: 1, posted: 0, failed: 1 });
  });
});

describe("fetchNewSentryIssues", () => {
  it("asks for unresolved issues of the last day, newest first, with the token as Bearer", async () => {
    const fetcher = vi.fn(async () => Response.json([{ id: "5" }, { id: "not-a-number" }, {}]));
    const issues = await fetchNewSentryIssues("dafit", "tok", fetcher as unknown as typeof fetch);
    expect(issues).toEqual([{ id: "5" }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sentry.io/api/0/organizations/dafit/issues/?query=is%3Aunresolved&statsPeriod=24h&sort=new&limit=25");
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("throws a status code, not the answer", async () => {
    const fetcher = vi.fn(async () => new Response("token sntryu_x is invalid", { status: 401 }));
    await expect(fetchNewSentryIssues("dafit", "tok", fetcher as unknown as typeof fetch)).rejects.toThrow("sentry issues: HTTP 401");
  });
});
