import { describe, expect, it } from "vitest";
import { fillPlaceholders, hostOf } from "./fill";

describe("fillPlaceholders", () => {
  const text = "Оператор: [ФИО ОПЕРАТОРА], адрес: [АДРЕС], email: [EMAIL ДЛЯ ОБРАЩЕНИЙ]. Run by [OPERATOR FULL NAME] at [DOMAIN]/legal, https://[ДОМЕН]. Версия: [ВЕРСИЯ], version [VERSION].";

  it("fills every placeholder it has a value for, in both languages", () => {
    const filled = fillPlaceholders(text, {
      operatorName: "Иванов Иван Иванович",
      operatorAddress: "г. Москва, ул. Тестовая, 1",
      contactEmail: "privacy@example.com",
      domain: "dafit.example",
      version: "2026-11",
    });
    expect(filled).toBe(
      "Оператор: Иванов Иван Иванович, адрес: г. Москва, ул. Тестовая, 1, email: privacy@example.com. Run by Иванов Иван Иванович at dafit.example/legal, https://dafit.example. Версия: 2026-11, version 2026-11.",
    );
  });

  it("leaves a placeholder when its value is missing", () => {
    expect(fillPlaceholders(text, { version: "2026-11" })).toContain("[ФИО ОПЕРАТОРА]");
    expect(fillPlaceholders(text, { version: "2026-11" })).toContain("[DOMAIN]/legal");
  });
});

describe("hostOf", () => {
  it("returns the host of a URL and nothing for an empty or broken one", () => {
    expect(hostOf("https://dafit.example/")).toBe("dafit.example");
    expect(hostOf("http://localhost:3000")).toBe("localhost:3000");
    expect(hostOf(undefined)).toBeUndefined();
    expect(hostOf("not a url")).toBeUndefined();
  });
});
