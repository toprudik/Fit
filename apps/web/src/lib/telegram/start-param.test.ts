import { describe, expect, it } from "vitest";
import { startParamPath } from "./start-param";

describe("startParamPath", () => {
  it("opens the trainer invite screen for ti_<code>", () => {
    expect(startParamPath("ti_ABCDEFGHJKLM")).toBe("/onboarding/trainer?code=ABCDEFGHJKLM");
  });

  it("opens the empty invite form when the code is missing", () => {
    expect(startParamPath("ti_")).toBe("/onboarding/trainer");
  });

  it("ignores no parameter, unknown keys and characters Telegram does not allow", () => {
    expect(startParamPath(undefined)).toBeNull();
    expect(startParamPath("")).toBeNull();
    expect(startParamPath("zz_1")).toBeNull();
    expect(startParamPath("ti_a/b")).toBeNull();
    expect(startParamPath(`ti_${"A".repeat(600)}`)).toBeNull();
  });
});
