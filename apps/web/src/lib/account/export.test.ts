import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { checkInRows, delegationRows, pageOrder, referralRows, reviewRows } = await import("./export");

const ME = "00000000-0000-4000-8000-000000000001";
const FRIEND = "00000000-0000-4000-8000-000000000002";
const TRAINER = "00000000-0000-4000-8000-000000000003";
const OTHER_TRAINER = "00000000-0000-4000-8000-000000000004";

/** Every string anywhere in the rows, to check no other person's id leaks through a nested field. */
const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

describe("export rows of other people's data", () => {
  it("keeps a referral to the user's role and drops the other people's ids and the friend's payment", () => {
    const row = {
      id: "r1",
      kind: "client_to_client",
      trainer_id: TRAINER,
      referrer_id: ME,
      referee_id: FRIEND,
      coaching_id: "friend-pair",
      referrer_coaching_id: "my-pair",
      qualifying_payment_id: "friend-payment",
      status: "qualified",
      qualified_at: "2026-10-10T10:00:00Z",
      voided_at: null,
      void_reason: null,
      created_at: "2026-10-01T10:00:00Z",
    };
    const [referrer] = referralRows([row], ME);
    expect(referrer).toMatchObject({ id: "r1", my_role: "referrer", status: "qualified", coaching_id: null });
    expect(strings(referrer)).not.toContain(FRIEND);
    expect(strings(referrer)).not.toContain(TRAINER);
    expect(strings(referrer)).not.toContain("friend-payment");
    expect(strings(referrer)).not.toContain("friend-pair");

    const [referee] = referralRows([row], FRIEND);
    expect(referee).toMatchObject({ my_role: "referee", coaching_id: "friend-pair" });
    expect(strings(referee)).not.toContain(ME);
  });

  it("names the other trainer of a delegation as the app shows them and drops ids and the invite hash", () => {
    const names = new Map([
      [OTHER_TRAINER, { id: OTHER_TRAINER, first_name: "Вера", last_name: "Тестова", display_name: null, username: "vera_test", phone: "+70000000000" }],
    ]);
    const row = {
      id: "d1",
      owner_trainer_id: ME,
      delegate_trainer_id: OTHER_TRAINER,
      kind: "assistant",
      session_id: null,
      scopes: ["schedule"],
      all_clients: true,
      status: "active",
      invite_hash: "\\x0102",
      starts_at: "2026-10-01T10:00:00Z",
      ends_at: null,
      accepted_at: "2026-10-01T11:00:00Z",
      revoked_at: null,
      reminded_at: null,
      created_at: "2026-10-01T10:00:00Z",
    };
    const [owner] = delegationRows([row], ME, names);
    expect(owner).toMatchObject({ my_role: "owner", other_trainer: { first_name: "Вера", last_name: "Тестова" } });
    expect(Object.keys(owner)).not.toContain("invite_hash");
    expect(strings(owner)).not.toContain(OTHER_TRAINER);
    expect(strings(owner)).not.toContain("vera_test");
    expect(strings(owner)).not.toContain("+70000000000");

    const [delegate] = delegationRows([row], OTHER_TRAINER, new Map());
    expect(delegate).toMatchObject({ my_role: "delegate", other_trainer: null });
    expect(strings(delegate)).not.toContain(ME);
  });

  it("says only whether the user recorded a check-in", () => {
    const [row] = checkInRows([{ booking_id: "b1", client_id: ME, trainer_id: TRAINER, method: "qr", recorded_by: OTHER_TRAINER }], ME);
    expect(row).toMatchObject({ booking_id: "b1", recorded_by_me: false });
    expect(strings(row)).not.toContain(OTHER_TRAINER);
  });

  it("keeps the user's review and the trainer's reply without the people's ids", () => {
    const [row] = reviewRows([{ id: "r1", coaching_id: "c1", client_id: ME, trainer_id: TRAINER, rating: 5, trainer_reply: "Спасибо" }]);
    expect(row).toMatchObject({ id: "r1", coaching_id: "c1", rating: 5, trainer_reply: "Спасибо" });
    expect(strings(row)).not.toContain(TRAINER);
  });
});

describe("export page order", () => {
  it("reads every table in primary key order, so pages neither repeat nor skip rows", () => {
    expect(pageOrder("bookings")).toEqual(["id"]);
    expect(pageOrder("data_shares")).toEqual(["coaching_id"]);
    expect(pageOrder("food_favorites")).toEqual(["user_id", "food_id"]);
    expect(pageOrder("personal_records")).toEqual(["client_id", "exercise_id", "record_type"]);
  });
});
