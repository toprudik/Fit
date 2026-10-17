import { describe, expect, it } from "vitest";
import { checkInPath, checkInPathFromScan, checkInTelegram, parseCheckInStartParam, placeCheckInTelegram } from "./link";

const SESSION = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const CODE = "aB3_-xY9zQ";

describe("check-in links", () => {
  it("round-trips the session and code through the startapp parameter", () => {
    const link = checkInTelegram(SESSION, CODE, "fitconnection_bot");
    expect(link).toBe(`https://t.me/fitconnection_bot?startapp=ck_${SESSION}_${CODE}`);
    expect(checkInPathFromScan(link)).toBe(checkInPath(SESSION, CODE));
    expect(parseCheckInStartParam(`ck_${SESSION}_${CODE}`)).toEqual({ sessionId: SESSION, code: CODE });
  });

  it("opens a location's printed QR", () => {
    const token = "Ab3_-Ab3_-Ab3_-Ab3_-Ab";
    expect(checkInPathFromScan(placeCheckInTelegram(token, "fitconnection_bot"))).toBe(`/client/checkin?place=${token}`);
    expect(checkInPathFromScan("https://t.me/fitconnection_bot?startapp=cl_short")).toBeNull();
  });

  it("refuses anything else", () => {
    expect(parseCheckInStartParam(`ck_${SESSION}${CODE}`)).toBeNull();
    expect(parseCheckInStartParam(`ck_${SESSION}_short`)).toBeNull();
    expect(parseCheckInStartParam(`ci_${SESSION}_${CODE}`)).toBeNull();
    expect(checkInPathFromScan(`https://example.com/?startapp=ck_${SESSION}_${CODE}`)).toBeNull();
    expect(checkInPathFromScan("not a link")).toBeNull();
  });
});
