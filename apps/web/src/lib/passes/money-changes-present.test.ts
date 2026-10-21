import { describe, expect, it } from "vitest";
import { moneyDetails, moneyLabel } from "./money-changes-present";

const ZONE = "Europe/Moscow";

describe("moneyDetails", () => {
  it("names a new expiry by the last valid day", () => {
    expect(
      moneyDetails("pass_changed", { expires_at: "2026-11-10T21:00:00Z" }, { expires_at: "2026-11-20T21:00:00Z" }, ZONE),
    ).toEqual([{ kind: "expires", from: "2026-11-10", to: "2026-11-20" }]);
    expect(moneyDetails("pass_changed", { expires_at: null }, { expires_at: "2026-11-20T21:00:00Z" }, ZONE)).toEqual([
      { kind: "expires", from: null, to: "2026-11-20" },
    ]);
  });

  it("names a new title, size and a changed note", () => {
    expect(
      moneyDetails("pass_changed", { title: "Старый", sessions_total: 8, note: null }, { title: "Новый", sessions_total: 10, note: "x" }, ZONE),
    ).toEqual([{ kind: "title", to: "Новый" }, { kind: "sessions", from: 8, to: 10 }, { kind: "note" }]);
  });

  it("gives the sum of a new payment, not of a confirmed one", () => {
    expect(moneyDetails("payment_created", null, { amount_minor: 500000, currency: "RUB", note: "x" }, ZONE)).toEqual([
      { kind: "amount", minor: 500000, currency: "RUB" },
    ]);
    expect(moneyDetails("payment_confirmed", { status: "reported" }, { status: "confirmed" }, ZONE)).toEqual([]);
    expect(moneyDetails("payment_changed", { amount_minor: 1 }, { amount_minor: 2 }, ZONE)).toEqual([]);
  });

  it("says nothing more about a new pass or a freeze", () => {
    expect(moneyDetails("pass_created", null, { title: "Пакет", note: "x", expires_at: "2026-11-20T21:00:00Z" }, ZONE)).toEqual([]);
    expect(moneyDetails("freeze_added", null, { period: "[2026-11-01,2026-11-05)" }, ZONE)).toEqual([]);
  });
});

describe("moneyLabel", () => {
  it("calls a client's waiting report a report, not an added payment (QA B11)", () => {
    expect(moneyLabel("payment_created", { status: "reported", amount_minor: 500000 })).toBe("payment_reported");
    expect(moneyLabel("payment_created", { status: "confirmed" })).toBe("payment_created");
    expect(moneyLabel("payment_confirmed", { status: "confirmed" })).toBe("payment_confirmed");
    expect(moneyLabel("pass_created", null)).toBe("pass_created");
  });
});
