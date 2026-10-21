import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { cardText } from "./card-text";

describe("story card text", () => {
  it("prints the sessions with the trainer's name on its own line", () => {
    const text = cardText(dictionaries.ru, "ru", { kind: "trainer", month: "2026-09-01", data: { count: 12, name: "Ира Тренер" } });
    expect(text).toEqual({ month: "Сентябрь 2026", figure: "12", label: "занятий с тренером", detail: "Ира Тренер" });
  });

  it("prints the weight change with a minus sign in the reader's unit", () => {
    expect(cardText(dictionaries.ru, "ru", { kind: "weight", month: "2026-09-01", data: { change: -1.5 } }).figure).toBe("−1,5 кг");
    expect(cardText(dictionaries.en, "en", { kind: "weight", month: "2026-09-01", data: { change: 1.5 } }).figure).toBe("+1.5 kg");
  });

  it("prints the new records with the latest one", () => {
    const text = cardText(dictionaries.ru, "ru", {
      kind: "records",
      month: "2026-09-01",
      data: { count: 2, name: "Присед", type: "max_weight", value: 100 },
    });
    expect(text.label).toBe("новых рекорда");
    expect(text.detail).toMatch(/^Присед: 100/);
  });

  it("prints a streak in its own unit", () => {
    expect(cardText(dictionaries.ru, "ru", { kind: "streak_workouts", month: "2026-09-01", data: { count: 5 } }).label).toBe(
      "недель тренировок подряд",
    );
    expect(cardText(dictionaries.en, "en", { kind: "streak_diary", month: "2026-09-01", data: { count: 1 } }).label).toBe(
      "day of food diary in a row",
    );
  });

  it("prints the new badges with the latest one by name", () => {
    const text = cardText(dictionaries.ru, "ru", { kind: "badges", month: "2026-09-01", data: { count: 2, code: "diary_7" } });
    expect(text).toEqual({ month: "Сентябрь 2026", figure: "2", label: "новых значка", detail: "Неделя дневника" });
    expect(cardText(dictionaries.ru, "ru", { kind: "badges", month: "2026-09-01", data: { count: 1, code: "gone" } }).detail).toBeNull();
  });

  it("prints a milestone with what happened on top and the trainer on its own line", () => {
    const text = cardText(dictionaries.ru, "ru", { kind: "milestone", month: "2026-10-01", data: { count: 25, name: "Ира Тренер" } });
    expect(text).toEqual({ month: "Новая веха", figure: "25", label: "занятий вместе", detail: "Ира Тренер" });
    expect(cardText(dictionaries.en, "en", { kind: "milestone", month: "2026-10-01", data: { count: 10 } }).detail).toBeNull();
  });

  it("prints a badge with the collection size and the badge by name", () => {
    const text = cardText(dictionaries.ru, "ru", { kind: "badge", month: "2026-10-01", data: { count: 3, code: "sessions_10" } });
    expect(text).toEqual({ month: "Новый значок", figure: "3", label: "значка в коллекции", detail: "10 занятий" });
    expect(cardText(dictionaries.en, "en", { kind: "badge", month: "2026-10-01", data: { count: 1, code: "sessions_1" } }).label).toBe(
      "badge collected",
    );
  });
});
