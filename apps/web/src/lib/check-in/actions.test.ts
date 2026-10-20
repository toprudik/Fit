import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: next.refresh }));
vi.mock("@/env/server", () => ({ serverEnv: () => ({ TELEGRAM_BOT_USERNAME: "dafit_test_bot" }) }));
// The SVG carries the link it encodes, so the tests can read what the QR points to.
vi.mock("qrcode", () => ({ default: { toString: async (link: string) => `<svg data-link="${link}"/>` } }));

type Answer = { data: unknown; error: { message: string; code: string } | null };

/** RPCs made as the signed-in user, and what the next one answers. */
const db = vi.hoisted(() => ({
  calls: [] as unknown[][],
  answer: { data: null, error: null } as Answer,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: (fn: string, args: unknown) => {
      db.calls.push(["rpc", fn, args]);
      return Promise.resolve(db.answer);
    },
  }),
}));

const { checkIn, checkInByPlace, loadCheckInQr, loadPlaceQr } = await import("./actions");

const SESSION = "00000000-0000-4000-8000-000000000001";
const BOOKING = "00000000-0000-4000-8000-000000000002";
const LOCATION = "00000000-0000-4000-8000-000000000003";
const CODE = "Ab3_-xY9zQ";
const PLACE = "AbCdEfGhIjKlMnOpQrSt_-";
const EXPIRED = { status: "done", outcome: "expired", bookingId: null, opensAt: null };
const fail = (message: string, code = "P0001") => ({ data: null, error: { message, code } });

beforeEach(() => {
  vi.clearAllMocks();
  db.calls = [];
  db.answer = { data: null, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("checkIn", () => {
  it("checks in by the session QR and refreshes", async () => {
    db.answer = { data: [{ outcome: "checked_in", booking_id: BOOKING, opens_at: null }], error: null };
    expect(await checkIn(SESSION, CODE)).toEqual({ status: "done", outcome: "checked_in", bookingId: BOOKING, opensAt: null });
    expect(db.calls).toEqual([["rpc", "check_in_by_qr", { p_session_id: SESSION, p_code: CODE }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("refreshes after a request too, and not for the other outcomes", async () => {
    db.answer = { data: [{ outcome: "requested", booking_id: BOOKING, opens_at: null }], error: null };
    await checkIn(SESSION, CODE);
    expect(next.refresh).toHaveBeenCalledOnce();
    for (const outcome of ["already", "too_early", "closed", "expired", "no_booking"]) {
      db.answer = { data: [{ outcome, booking_id: null, opens_at: "2026-10-18T09:30:00Z" }], error: null };
      expect(await checkIn(SESSION, CODE)).toEqual({ status: "done", outcome, bookingId: null, opensAt: "2026-10-18T09:30:00Z" });
    }
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("reads a malformed session or code as an expired QR, without a call", async () => {
    expect(await checkIn("nope", CODE)).toEqual(EXPIRED);
    for (const code of ["", "short", "Ab3_-xY9zQ1", "Ab3_-xY9z!"]) expect(await checkIn(SESSION, code)).toEqual(EXPIRED);
    expect(db.calls).toEqual([]);
  });

  it("fails on an error, an empty answer or an outcome it does not know", async () => {
    db.answer = fail("boom", "XX000");
    expect(await checkIn(SESSION, CODE)).toEqual({ status: "error" });
    db.answer = { data: [], error: null };
    expect(await checkIn(SESSION, CODE)).toEqual({ status: "error" });
    db.answer = { data: [{ outcome: "teleported", booking_id: BOOKING, opens_at: null }], error: null };
    expect(await checkIn(SESSION, CODE)).toEqual({ status: "error" });
    expect(next.refresh).not.toHaveBeenCalled();
  });
});

describe("checkInByPlace", () => {
  it("checks in by the printed QR and refreshes", async () => {
    db.answer = { data: [{ outcome: "checked_in", booking_id: BOOKING, opens_at: null }], error: null };
    expect(await checkInByPlace(PLACE)).toEqual({ status: "done", outcome: "checked_in", bookingId: BOOKING, opensAt: null });
    expect(db.calls).toEqual([["rpc", "check_in_by_location", { p_token: PLACE }]]);
    expect(next.refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh for any other outcome", async () => {
    db.answer = { data: [{ outcome: "no_booking", booking_id: null, opens_at: null }], error: null };
    expect(await checkInByPlace(PLACE)).toEqual({ status: "done", outcome: "no_booking", bookingId: null, opensAt: null });
    expect(next.refresh).not.toHaveBeenCalled();
  });

  it("reads a malformed token as an expired QR, without a call", async () => {
    for (const token of ["", "short", `${PLACE}x`, "AbCdEfGhIjKlMnOpQrSt.!"]) expect(await checkInByPlace(token)).toEqual(EXPIRED);
    expect(db.calls).toEqual([]);
  });

  it("fails on an error or an unknown outcome", async () => {
    db.answer = fail("boom", "XX000");
    expect(await checkInByPlace(PLACE)).toEqual({ status: "error" });
    db.answer = { data: [{ outcome: "weird", booking_id: null, opens_at: null }], error: null };
    expect(await checkInByPlace(PLACE)).toEqual({ status: "error" });
  });
});

describe("loadPlaceQr", () => {
  it("draws the location's Mini App link", async () => {
    db.answer = { data: PLACE, error: null };
    expect(await loadPlaceQr(LOCATION)).toEqual({ status: "done", qrSvg: `<svg data-link="https://t.me/dafit_test_bot?startapp=cl_${PLACE}"/>` });
    expect(db.calls).toEqual([["rpc", "location_check_in_token", { p_location_id: LOCATION, p_renew: false }]]);
  });

  it("asks for a new code when renewing", async () => {
    db.answer = { data: PLACE, error: null };
    await loadPlaceQr(LOCATION, true);
    expect(db.calls).toEqual([["rpc", "location_check_in_token", { p_location_id: LOCATION, p_renew: true }]]);
  });

  it("refuses a bad id without a call and fails on an error or no token", async () => {
    expect(await loadPlaceQr("nope")).toEqual({ status: "error" });
    expect(db.calls).toEqual([]);
    db.answer = fail("not_owner", "42501");
    expect(await loadPlaceQr(LOCATION)).toEqual({ status: "error" });
    db.answer = { data: null, error: null };
    expect(await loadPlaceQr(LOCATION)).toEqual({ status: "error" });
  });
});

describe("loadCheckInQr", () => {
  const row = { code: CODE, refresh_at: "2026-10-18T10:00:15Z", opens_at: "2026-10-18T09:30:00Z" };

  it("draws the current code and lists who checked in by name", async () => {
    db.answer = {
      data: [
        {
          ...row,
          checked_in: [
            { booking_id: BOOKING, first_name: " Анна ", last_name: "Петрова" },
            { booking_id: "b-2", first_name: "Олег", last_name: null },
          ],
        },
      ],
      error: null,
    };
    expect(await loadCheckInQr(SESSION)).toEqual({
      status: "open",
      qrSvg: `<svg data-link="https://t.me/dafit_test_bot?startapp=ck_${SESSION}_${CODE}"/>`,
      refreshAt: row.refresh_at,
      opensAt: row.opens_at,
      checkedIn: [
        { bookingId: BOOKING, name: "Анна Петрова" },
        { bookingId: "b-2", name: "Олег" },
      ],
    });
    expect(db.calls).toEqual([["rpc", "session_check_in_qr", { p_session_id: SESSION }]]);
  });

  it("has no QR before check-in opens", async () => {
    db.answer = { data: [{ ...row, code: null, checked_in: [] }], error: null };
    expect(await loadCheckInQr(SESSION)).toMatchObject({ status: "open", qrSvg: null, checkedIn: [] });
  });

  it("skips malformed entries of the checked-in list", async () => {
    db.answer = {
      data: [{ ...row, checked_in: [null, "x", [1], { first_name: "Без брони" }, { booking_id: 5 }, { booking_id: BOOKING, first_name: 1, last_name: "Ли" }] }],
      error: null,
    };
    expect(await loadCheckInQr(SESSION)).toMatchObject({ checkedIn: [{ bookingId: BOOKING, name: "Ли" }] });
    db.answer = { data: [{ ...row, checked_in: null }], error: null };
    expect(await loadCheckInQr(SESSION)).toMatchObject({ checkedIn: [] });
  });

  it("tells a closed check-in apart from an error and refuses a bad id without a call", async () => {
    expect(await loadCheckInQr("nope")).toEqual({ status: "error" });
    expect(db.calls).toEqual([]);
    db.answer = fail("check_in_closed");
    expect(await loadCheckInQr(SESSION)).toEqual({ status: "closed" });
    db.answer = fail("not_owner", "42501");
    expect(await loadCheckInQr(SESSION)).toEqual({ status: "error" });
    db.answer = { data: [], error: null };
    expect(await loadCheckInQr(SESSION)).toEqual({ status: "error" });
  });
});
