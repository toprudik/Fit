import { describe, expect, it } from "vitest";
import { groupReferralBonuses, type ReferralBonusRow } from "./bonuses";

const row = (bonus_id: string, bonus_status: ReferralBonusRow["bonus_status"], due = false): ReferralBonusRow => ({
  bonus_id,
  bonus_status,
  referral_status: "pending",
  due,
});

describe("groupReferralBonuses", () => {
  it("splits due, waiting and given bonuses in the database order and leaves void ones out", () => {
    const rows = [row("a", "pending", true), row("b", "pending"), row("c", "pending", true), row("d", "granted"), row("e", "void")];
    expect(groupReferralBonuses(rows)).toEqual({
      due: [rows[0], rows[2]],
      waiting: [rows[1]],
      granted: [rows[3]],
    });
  });

  it("is empty for no bonuses", () => {
    expect(groupReferralBonuses([])).toEqual({ due: [], waiting: [], granted: [] });
  });
});
