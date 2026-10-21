import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { cardText } from "./card-text";
import { storyCardFrom } from "./report";

describe("trainer story card text (marketing backlog 5)", () => {
  it("prints the month's sessions, clients and milestones, nothing else", () => {
    const text = cardText(dictionaries.ru, "ru", { kind: "trainer_month", month: "2026-09-01", data: { count: 48, clients: 12, milestones: 3 } });
    expect(text).toEqual({
      month: "Сентябрь 2026",
      figure: "48",
      label: "проведённых занятий за месяц",
      detail: "Клиентов на занятиях: 12 · Дошли до 10, 25, 50 или 100 занятий: 3",
    });
    const quiet = cardText(dictionaries.en, "en", { kind: "trainer_month", month: "2026-09-01", data: { count: 1, clients: 1, milestones: 0 } });
    expect(quiet).toMatchObject({ label: "session held this month", detail: "Clients at sessions: 1" });
  });

  it("puts the name in place of a figure on the showcase card", () => {
    const card = { kind: "trainer_showcase" as const, month: "2026-10-01", data: { name: "Ира", slug: "ira", trial: true } };
    expect(cardText(dictionaries.ru, "ru", card)).toEqual({ month: "Тренер в DaFit", figure: "", label: "Ира", detail: "Пробное занятие по ссылке" });
    expect(cardText(dictionaries.ru, "ru", { ...card, data: { slug: "ira", trial: false } }).label).toBe("Витрина тренера");
  });

  it("reads the trainer kinds from the database answer", () => {
    expect(storyCardFrom({ kind: "trainer_month", month: "2026-09-01", data: { count: 3, clients: 2, milestones: 1 } })?.kind).toBe("trainer_month");
    expect(storyCardFrom({ kind: "trainer_showcase", month: "2026-10-01", data: { name: "Ира", slug: "Bad Slug!", trial: true } })).toBeNull();
  });
});
