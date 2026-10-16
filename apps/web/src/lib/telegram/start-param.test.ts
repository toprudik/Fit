import { describe, expect, it } from "vitest";
import { startParamPath } from "./start-param";

describe("startParamPath", () => {
  it("opens the trainer invite screen for ti_<code>", () => {
    expect(startParamPath("ti_ABCDEFGHJKLM")).toBe("/onboarding/trainer?code=ABCDEFGHJKLM");
  });

  it("opens the empty invite form when the code is missing", () => {
    expect(startParamPath("ti_")).toBe("/onboarding/trainer");
  });

  it("opens the client link landing for ci_<token>", () => {
    expect(startParamPath("ci_Ab3_-Ab3_-Ab3_-Ab3_-Ab")).toBe("/i/Ab3_-Ab3_-Ab3_-Ab3_-Ab");
  });

  it("ignores a client link with a malformed token", () => {
    expect(startParamPath("ci_")).toBeNull();
    expect(startParamPath("ci_short")).toBeNull();
  });

  it("opens the trainer showcase for tp_<slug>", () => {
    expect(startParamPath("tp_anna-fit")).toBe("/trainers/anna-fit");
  });

  it("ignores a showcase with a malformed address", () => {
    expect(startParamPath("tp_")).toBeNull();
    expect(startParamPath("tp_Anna")).toBeNull();
    expect(startParamPath("tp_a_b")).toBeNull();
  });

  it("ignores no parameter, unknown keys and characters Telegram does not allow", () => {
    expect(startParamPath(undefined)).toBeNull();
    expect(startParamPath("")).toBeNull();
    expect(startParamPath("zz_1")).toBeNull();
    expect(startParamPath("ti_a/b")).toBeNull();
    expect(startParamPath(`ti_${"A".repeat(600)}`)).toBeNull();
  });
});
