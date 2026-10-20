import { describe, expect, it } from "vitest";
import { isConsentGatedApi } from "./gate";

describe("isConsentGatedApi", () => {
  it("gates the user's API routes", () => {
    expect(isConsentGatedApi("/api/settings/time-zone")).toBe(true);
    expect(isConsentGatedApi("/api/trainer/export/clients")).toBe(true);
    expect(isConsentGatedApi("/api/admin/stats")).toBe(true);
  });

  it("leaves theme and language and every page alone", () => {
    expect(isConsentGatedApi("/api/settings/preferences")).toBe(false);
    expect(isConsentGatedApi("/client")).toBe(false);
    expect(isConsentGatedApi("/apiary")).toBe(false);
  });
});
