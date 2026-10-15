import { NextResponse } from "next/server";
import { describe, expect, it } from "vitest";
import { cookieAttributes, cookieAttributesString, SECURE_COOKIES } from "./cookie-attributes";

describe("cookieAttributes", () => {
  it("in production lets the cookies through Telegram Web's cross-site iframe: SameSite=None, Secure, Partitioned", () => {
    expect(cookieAttributes(true)).toEqual({ sameSite: "none", secure: true, partitioned: true });
    expect(cookieAttributesString(true)).toBe("SameSite=None; Secure; Partitioned");
  });

  it("over plain http in development stays Lax, since SameSite=None needs Secure", () => {
    expect(cookieAttributes(false)).toEqual({ sameSite: "lax", secure: false });
    expect(cookieAttributesString(false)).toBe("SameSite=Lax");
  });

  it("follows the build", () => {
    expect(SECURE_COOKIES).toBe(process.env.NODE_ENV === "production");
  });

  it("reach the Set-Cookie header through Next, for setting and for deleting", () => {
    const response = NextResponse.json({});
    response.cookies.set("x", "1", { path: "/", ...cookieAttributes(true) });
    expect(response.headers.get("set-cookie")).toBe("x=1; Path=/; Secure; SameSite=none; Partitioned");

    // A partitioned cookie is replaced or deleted only by a Set-Cookie that is partitioned too.
    response.cookies.delete({ name: "x", path: "/", ...cookieAttributes(true) });
    expect(response.headers.get("set-cookie")).toBe("x=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=none; Partitioned");
  });
});
