import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_APP_URL: "https://fit.example" } }));

const { isSameOrigin } = await import("./same-origin");

const request = (headers: Record<string, string>) => new Request("https://fit.example/auth/sign-out", { method: "POST", headers });

describe("isSameOrigin", () => {
  it("accepts our own origin, with or without Sec-Fetch-Site", () => {
    expect(isSameOrigin(request({ origin: "https://fit.example", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOrigin(request({ origin: "https://fit.example" }))).toBe(true);
  });

  it.each<Record<string, string>>([
    {},
    { origin: "null" },
    { origin: "https://evil.example" },
    { origin: "http://fit.example" },
    { origin: "https://fit.example:8443" },
    { origin: "https://fit.example.evil.example" },
    { origin: "https://sub.fit.example" },
    { origin: "https://fit.example/" },
    { origin: "https://fit.example", "sec-fetch-site": "cross-site" },
    { origin: "https://fit.example", "sec-fetch-site": "same-site" },
    { origin: "https://fit.example", "sec-fetch-site": "none" },
    { referer: "https://fit.example/profile" },
  ])("refuses %j", (headers) => {
    expect(isSameOrigin(request(headers))).toBe(false);
  });
});
