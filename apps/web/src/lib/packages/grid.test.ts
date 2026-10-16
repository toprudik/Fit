import { describe, expect, it } from "vitest";
import { perSessionMinor, priceGrid, savingsPct, templatePrices, type GridInput } from "./grid";

const pack = (id: string, sessionsCount: number, priceMinor: number, extra: Partial<GridInput> = {}): GridInput => ({
  id,
  sessionsCount,
  priceMinor,
  currency: "RUB",
  appliesTo: "any",
  ...extra,
});

describe("price grid", () => {
  it("prices per session and savings as in MONEY-1, with the badge on the 20-pack", () => {
    const rows = priceGrid([pack("a", 1, 200000), pack("b", 5, 900000), pack("c", 10, 1600000), pack("d", 20, 3000000)]);
    expect(rows.map((row) => [row.perSessionMinor, row.savingsPct, row.isBestValue])).toEqual([
      [200000, null, false],
      [180000, 10, false],
      [160000, 20, false],
      [150000, 25, true],
    ]);
  });

  it("shows no savings and no badge for a pack no cheaper than the drop-in (MONEY-2)", () => {
    const rows = priceGrid([pack("a", 1, 100000), pack("b", 4, 400000), pack("c", 3, 330000)]);
    expect(rows.map((row) => [row.savingsPct, row.isBestValue])).toEqual([
      [null, false],
      [null, false],
      [null, false],
    ]);
  });

  it("shows no savings without a drop-in", () => {
    expect(priceGrid([pack("a", 5, 900000)])[0]).toMatchObject({ savingsPct: null, isBestValue: false });
  });

  it("gives a tie to the larger pack", () => {
    const rows = priceGrid([pack("a", 1, 100000), pack("b", 5, 450000), pack("c", 10, 900000)]);
    expect(rows.map((row) => row.isBestValue)).toEqual([false, false, true]);
  });

  it("compares a pack only with the drop-in of its own currency and type", () => {
    const rows = priceGrid([
      pack("a", 1, 200000),
      pack("b", 1, 300000, { appliesTo: "personal" }),
      pack("c", 10, 2400000, { appliesTo: "personal" }),
      pack("d", 10, 1600000, { appliesTo: "group" }),
      pack("e", 5, 4000, { currency: "USD" }),
    ]);
    expect(rows.map((row) => row.savingsPct)).toEqual([null, null, 20, 20, null]);
    expect(rows.filter((row) => row.isBestValue).map((row) => row.id)).toEqual(["c", "d"]);
  });

  it("rounds the per-session price half up and the savings down", () => {
    expect(perSessionMinor(1000, 3)).toBe(333);
    expect(perSessionMinor(1001, 2)).toBe(501);
    expect(savingsPct(199, 5, 200)).toBeNull();
    expect(savingsPct(150, 5, 200)).toBe(25);
    expect(savingsPct(133, 5, 200)).toBe(33);
  });

  it("suggests the template prices from the drop-in", () => {
    expect(templatePrices(200000)).toEqual([
      { sessions: 5, priceMinor: 900000 },
      { sessions: 10, priceMinor: 1600000 },
      { sessions: 20, priceMinor: 3000000 },
    ]);
    expect(templatePrices(155000).map((p) => p.priceMinor)).toEqual([697500, 1240000, 2325000]);
  });
});
