import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { onboardingNext, withNext } = await import("./next");

describe("onboardingNext", () => {
  it("keeps a page of the app with its query", () => {
    expect(onboardingNext("/onboarding/trainer?code=ABCD")).toBe("/onboarding/trainer?code=ABCD");
    expect(onboardingNext("/client")).toBe("/client");
  });

  it("falls back to / for nothing, another site or a route handler", () => {
    expect(onboardingNext(null)).toBe("/");
    expect(onboardingNext(["/client"])).toBe("/");
    expect(onboardingNext("https://evil.example/client")).toBe("/");
    expect(onboardingNext("//evil.example")).toBe("/");
    expect(onboardingNext("/api/settings/preferences")).toBe("/");
  });

  it("never leads back into the onboarding steps, so they can't loop", () => {
    expect(onboardingNext("/onboarding/consent?next=%2Fclient")).toBe("/");
    expect(onboardingNext("/onboarding/preferences")).toBe("/");
  });
});

describe("withNext", () => {
  it("encodes the next screen into the query", () => {
    expect(withNext("/onboarding/preferences", "/onboarding/trainer?code=AB")).toBe("/onboarding/preferences?next=%2Fonboarding%2Ftrainer%3Fcode%3DAB");
  });
});
