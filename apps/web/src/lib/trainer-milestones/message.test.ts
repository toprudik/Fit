import { describe, expect, it } from "vitest";
import { renderMessage } from "@/lib/notifications/messages";

const row = { kind: "trainer_milestone" as const, locale: "ru" as const, time_zone: "Europe/Moscow", payload: {} };
const app = { appUrl: "https://fit.example", group: false };

describe("trainer milestone message (marketing 14)", () => {
  it("names the milestone in the trainer's language and opens «Мои вехи»", () => {
    expect(renderMessage({ ...row, payload: { milestone: "sessions_100" } }, app)).toEqual({
      text: "Новая веха: «100 занятий». Сто проведённых занятий в DaFit.",
      buttons: [{ text: "Мои вехи", web_app: { url: "https://fit.example/trainer/milestones?source=trainer_milestone" } }],
    });
    expect(renderMessage({ ...row, locale: "en", payload: { milestone: "clients_5" } }, app)?.text).toBe(
      "New milestone: “Five clients”. Five clients train with you in DaFit at the same time.",
    );
  });

  it("still tells about a milestone it doesn't know", () => {
    expect(renderMessage({ ...row, payload: { milestone: "sessions_1000" } }, app)?.text).toBe("У тебя новая веха.");
  });
});
