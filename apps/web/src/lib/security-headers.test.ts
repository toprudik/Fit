import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";
import { cookieAttributes, cookieAttributesString } from "./cookie-attributes";

async function headersFor() {
  const rules = (await nextConfig.headers?.()) ?? [];
  const all = rules.find((rule) => rule.source === "/:path*");
  return new Map((all?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]));
}

describe("security headers (next.config.ts)", () => {
  it("are sent on every path", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    expect(rules.map((rule) => rule.source)).toContain("/:path*");
  });

  it("lock the CSP directives in, and let only Telegram frame the app", async () => {
    const csp = (await headersFor()).get("content-security-policy") ?? "";
    const directives = new Map(
      csp.split(";").map((part) => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name, values.join(" ")];
      }),
    );
    expect(directives.get("frame-ancestors")).toBe("'self' https://web.telegram.org https://*.telegram.org");
    expect(directives.get("object-src")).toBe("'none'");
    expect(directives.get("base-uri")).toBe("'self'");
    expect(directives.get("form-action")).toBe("'self'");
    // No wildcard source anywhere: "*" alone or "https:" would let any site in.
    expect(csp).not.toMatch(/(^|\s)(\*|https:|http:)(\s|;|$)/);
  });

  it("pin https, sniffing, referrer and powerful features", async () => {
    const headers = await headersFor();
    expect(headers.get("strict-transport-security")).toMatch(/^max-age=(\d+); includeSubDomains$/);
    expect(Number(/max-age=(\d+)/.exec(headers.get("strict-transport-security") ?? "")?.[1])).toBeGreaterThanOrEqual(31536000);
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(self), microphone=(), geolocation=()");
  });

  it("never sends X-Frame-Options, which would stop Telegram from framing the Mini App", async () => {
    expect((await headersFor()).has("x-frame-options")).toBe(false);
  });

  it("hide the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe("cookie attributes (ADR 0004)", () => {
  it("are SameSite=None; Secure; Partitioned in production", () => {
    expect(cookieAttributes(true)).toEqual({ sameSite: "none", secure: true, partitioned: true });
    expect(cookieAttributesString(true)).toBe("SameSite=None; Secure; Partitioned");
  });

  it("never pair SameSite=None with an insecure cookie", () => {
    expect(cookieAttributes(false)).toEqual({ sameSite: "lax", secure: false });
  });
});
