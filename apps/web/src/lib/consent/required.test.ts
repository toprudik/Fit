import { describe, expect, it } from "vitest";
import { BETA_TERMS_VERSION } from "./beta-terms";
import { LEGAL_VERSION, missingTermsConsents, pendingStep } from "./required";

const terms = [
  { kind: "beta_terms", version: BETA_TERMS_VERSION },
  { kind: "terms", version: LEGAL_VERSION },
  { kind: "privacy_policy", version: LEGAL_VERSION },
  { kind: "age_confirmed", version: LEGAL_VERSION },
];

describe("pendingStep", () => {
  it("starts with the terms for a new user", () => {
    expect(pendingStep([])).toBe("terms");
  });

  it("asks someone who accepted only the beta terms for the rest of that screen", () => {
    expect(pendingStep([{ kind: "beta_terms", version: BETA_TERMS_VERSION }])).toBe("terms");
    expect(missingTermsConsents([{ kind: "beta_terms", version: BETA_TERMS_VERSION }]).map((c) => c.kind)).toEqual([
      "terms",
      "privacy_policy",
      "age_confirmed",
    ]);
  });

  it("goes on to personal data, then needs nothing more; health data is never required", () => {
    expect(pendingStep(terms)).toBe("personal");
    expect(pendingStep([...terms, { kind: "pd_general", version: LEGAL_VERSION }])).toBeNull();
  });

  it("does not count an older version", () => {
    expect(pendingStep([...terms.slice(1), { kind: "beta_terms", version: "2026-10-beta" }])).toBe("terms");
  });
});
