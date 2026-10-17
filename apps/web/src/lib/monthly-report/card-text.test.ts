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
});
