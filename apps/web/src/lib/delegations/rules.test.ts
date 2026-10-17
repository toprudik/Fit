import { describe, expect, it } from "vitest";
import { invitePath, isAssistantScope, isInviteToken } from "./rules";

describe("delegation rules", () => {
  it("never offers passes or payments to an assistant", () => {
    expect(isAssistantScope("progress")).toBe(true);
    expect(isAssistantScope("passes")).toBe(false);
    expect(isAssistantScope("payments")).toBe(false);
  });

  it("accepts only url-safe invite tokens", () => {
    expect(isInviteToken("abcDEF123_-abcDEF123_-ab")).toBe(true);
    expect(isInviteToken("short")).toBe(false);
    expect(isInviteToken("abc/def+ghi=abc/def+ghi=")).toBe(false);
  });

  it("puts the token into the accept page's query", () => {
    expect(invitePath("abc_DEF-123")).toBe("/trainer/team/accept?token=abc_DEF-123");
  });
});
