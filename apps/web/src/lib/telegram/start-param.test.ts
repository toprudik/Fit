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

  it("opens the trial link landing for tl_<token>", () => {
    expect(startParamPath("tl_Ab3_-Ab3_-Ab3_-Ab3_-Ab")).toBe("/trial/Ab3_-Ab3_-Ab3_-Ab3_-Ab");
    expect(startParamPath("tl_short")).toBeNull();
  });

  it("opens a client's new payment for t_pay_<coachingId> and a pass for c_pass_<passId>", () => {
    const id = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
    expect(startParamPath(`t_pay_${id}`)).toBe(`/trainer/clients/${id}/payments?action=new`);
    expect(startParamPath(`c_pass_${id}`)).toBe(`/client/passes/${id}`);
    expect(startParamPath("c_pass_42")).toBeNull();
  });

  it("opens the answer to a contact request for cr_<request id>", () => {
    const id = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
    expect(startParamPath(`cr_${id}`)).toBe(`/contact/${id}`);
    expect(startParamPath("cr_42")).toBeNull();
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
