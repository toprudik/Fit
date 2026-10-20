import { describe, expect, it, vi } from "vitest";
import { savePreparedShare } from "./prepared-message";

vi.mock("server-only", () => ({}));

const share = {
  telegramId: 1001,
  title: "Приглашение",
  description: "Зову тебя в DaFit",
  text: "Зову тебя в DaFit\nhttps://app.example.test/r/abc123def4",
  buttonText: "Открыть",
  buttonUrl: "https://t.me/example_bot?startapp=rf_abc123def4",
  thumbnailUrl: "https://app.example.test/apple-icon.png",
};

function answer(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("savePreparedShare", () => {
  it("sends an article with the button for this user and answers its id", async () => {
    const fetchImpl = answer({ ok: true, result: { id: "prep_1", expiration_date: 1 } });
    await expect(savePreparedShare("1:test", share, fetchImpl)).resolves.toBe("prep_1");
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(String(url)).toMatch(/\/savePreparedInlineMessage$/);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.user_id).toBe(1001);
    expect(body.result).toMatchObject({
      type: "article",
      title: "Приглашение",
      input_message_content: { message_text: share.text },
      reply_markup: { inline_keyboard: [[{ text: "Открыть", url: share.buttonUrl }]] },
    });
    expect(body.allow_group_chats).toBe(true);
  });

  it("answers null when Telegram refuses or cannot be reached", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(savePreparedShare("1:test", share, answer({ ok: false, error_code: 400 }, 400))).resolves.toBeNull();
    const offline = vi.fn(async () => {
      throw new Error("https://api.telegram.org/bot1:test/ failed");
    }) as unknown as typeof fetch;
    await expect(savePreparedShare("1:test", share, offline)).resolves.toBeNull();
    // Never the URL, which carries the token.
    expect(error.mock.calls.flat().join(" ")).not.toContain("1:test");
    error.mockRestore();
  });
});
