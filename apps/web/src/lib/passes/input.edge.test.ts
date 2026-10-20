import { describe, expect, it } from "vitest";
import { z } from "zod";
import { adjustInput, amount, freezeInput, invalidFields, pastSessionInput, sellInput } from "./input";

const PASS = "11111111-1111-4111-8111-111111111111";
const COACHING = "22222222-2222-4222-8222-222222222222";

const pastSession = (time: string) => ({ coachingId: COACHING, day: "2026-10-10", time, durationMin: 60, status: "attended" });

describe("pass inputs", () => {
  it("takes an amount above zero only", () => {
    expect(amount.safeParse("0").success).toBe(false);
    expect(amount.safeParse("1 500").data).toBe(150000);
  });

  it("lets a freeze last a single day", () => {
    expect(freezeInput.safeParse({ passId: PASS, from: "2026-10-10", to: "2026-10-10", reason: "" }).success).toBe(true);
    expect(freezeInput.safeParse({ passId: PASS, from: "2026-10-10", to: "2026-10-09", reason: "" }).success).toBe(false);
  });

  it("refuses an adjustment of zero sessions", () => {
    expect(adjustInput.safeParse({ passId: PASS, delta: 0, note: "ошибка" }).success).toBe(false);
    expect(adjustInput.safeParse({ passId: PASS, delta: -1, note: "ошибка" }).success).toBe(true);
  });

  it("takes a past session time only as a real HH:MM", () => {
    expect(pastSessionInput.safeParse(pastSession("23:59")).success).toBe(true);
    expect(pastSessionInput.safeParse(pastSession("24:00")).success).toBe(false);
    expect(pastSessionInput.safeParse(pastSession("9:5")).success).toBe(false);
  });

  it("lists each failed field once as a dotted path", () => {
    const result = sellInput.safeParse({
      coachingId: "x",
      startsOn: "2026-10-10",
      note: "",
      source: { kind: "custom", title: "", sessions: 0, price: "abc", validity: "", appliesTo: "personal" },
      payment: null,
    });
    expect(result.success).toBe(false);
    const fields = invalidFields(result.error!);
    expect(fields).toEqual(expect.arrayContaining(["coachingId", "source.title", "source.sessions", "source.price"]));
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("merges two problems with the same field into one path", () => {
    const error = new z.ZodError([
      { code: "custom", path: ["payment", "amount"], message: "a", input: "0" },
      { code: "custom", path: ["payment", "amount"], message: "b", input: "0" },
      { code: "custom", path: ["passId"], message: "c", input: "x" },
    ]);
    expect(invalidFields(error)).toEqual(["payment.amount", "passId"]);
  });
});
