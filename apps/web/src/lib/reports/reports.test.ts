import { describe, expect, it } from "vitest";
import { canAppeal, isReportReason, isReportStatus, REPORT_CONTACT_MAX, reportText } from "./reports";

describe("reportText", () => {
  it("trims and treats blank as no text", () => {
    expect(reportText("  Грубит в ответе  ")).toBe("Грубит в ответе");
    expect(reportText("   ")).toBeNull();
    expect(reportText(null)).toBeNull();
  });

  it("flags text over the limit", () => {
    expect(reportText("a".repeat(2000))).toBe("a".repeat(2000));
    expect(reportText("a".repeat(2001))).toBe("long");
    expect(reportText("a".repeat(REPORT_CONTACT_MAX + 1), REPORT_CONTACT_MAX)).toBe("long");
  });
});

describe("canAppeal", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("allows an appeal within six months of the decision", () => {
    expect(canAppeal({ status: "hidden", resolvedAt: "2026-05-01T00:00:00Z", appealed: false }, now)).toBe(true);
    expect(canAppeal({ status: "kept", resolvedAt: "2026-10-19T00:00:00Z", appealed: false }, now)).toBe(true);
  });

  it("refuses after six months, before a decision, or twice", () => {
    expect(canAppeal({ status: "hidden", resolvedAt: "2026-04-19T00:00:00Z", appealed: false }, now)).toBe(false);
    expect(canAppeal({ status: "open", resolvedAt: null, appealed: false }, now)).toBe(false);
    expect(canAppeal({ status: "dismissed", resolvedAt: null, appealed: false }, now)).toBe(false);
    expect(canAppeal({ status: "hidden", resolvedAt: "2026-10-01T00:00:00Z", appealed: true }, now)).toBe(false);
  });
});

describe("guards", () => {
  it("accepts only known reasons and statuses", () => {
    expect(isReportReason("spam")).toBe(true);
    expect(isReportReason("rude")).toBe(false);
    expect(isReportStatus("dismissed")).toBe(true);
    expect(isReportStatus("closed")).toBe(false);
  });
});
