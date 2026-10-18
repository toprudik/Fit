import { describe, expect, it } from "vitest";
import { referralCounts } from "./counts";
import type { InvitedTrainer } from "./load";

const trainer = (patch: Partial<InvitedTrainer>): InvitedTrainer => ({
  id: "r1",
  firstName: "Ника",
  createdAt: "2026-10-01T10:00:00Z",
  status: "pending",
  active: false,
  bonusPending: false,
  ...patch,
});

describe("referralCounts", () => {
  it("counts who came, who is active and the bonuses that wait", () => {
    expect(
      referralCounts([
        trainer({ id: "a", active: true, bonusPending: true }),
        trainer({ id: "b", bonusPending: true }),
        trainer({ id: "c", status: "qualified", active: true }),
      ]),
    ).toEqual({ invited: 3, active: 2, bonusesPending: 2 });
  });

  it("never counts a void referral as active", () => {
    expect(referralCounts([trainer({ status: "void", active: true })])).toEqual({ invited: 1, active: 0, bonusesPending: 0 });
  });

  it("is all zeros when nobody came", () => {
    expect(referralCounts([])).toEqual({ invited: 0, active: 0, bonusesPending: 0 });
  });
});
