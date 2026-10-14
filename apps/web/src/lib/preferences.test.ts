import { describe, expect, it } from "vitest";
import { PREFERENCE_MAX_AGE, preferenceCookie, preferenceCookieOptions, readCookie } from "./preferences";

describe("preference cookies", () => {
  it("last a year", () => {
    expect(PREFERENCE_MAX_AGE).toBe(31_536_000);
  });

  it("are readable by the pre-paint script and the proxy, and not sent cross-site", () => {
    expect(preferenceCookieOptions).toMatchObject({ path: "/", maxAge: PREFERENCE_MAX_AGE, sameSite: "lax", httpOnly: false });
  });

  it("are Secure only in production builds", () => {
    expect(preferenceCookieOptions.secure).toBe(process.env.NODE_ENV === "production");
  });
});

describe("preferenceCookie", () => {
  it("builds a document.cookie string for the whole site", () => {
    expect(preferenceCookie("dafit-theme", "light", false)).toBe("dafit-theme=light; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("adds Secure when asked", () => {
    expect(preferenceCookie("dafit-locale", "en", true)).toBe("dafit-locale=en; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  it("is not Secure outside a browser by default", () => {
    // Node has no `location`; in the browser the default follows location.protocol.
    expect(preferenceCookie("dafit-zone", "trainer")).not.toContain("Secure");
  });

  it("encodes values so separators cannot break the cookie", () => {
    expect(preferenceCookie("x", "a; b=c", false).split(";")[0]).toBe("x=a%3B%20b%3Dc");
  });
});

describe("readCookie", () => {
  const jar = "dafit-zone=trainer; xdafit-theme=dark; dafit-theme=light;dafit-locale=en; empty=";

  it("finds a cookie among others, with or without spaces", () => {
    expect(readCookie(jar, "dafit-zone")).toBe("trainer");
    expect(readCookie(jar, "dafit-theme")).toBe("light");
    expect(readCookie(jar, "dafit-locale")).toBe("en");
  });

  it("matches the whole name, not a suffix", () => {
    expect(readCookie("xdafit-theme=dark", "dafit-theme")).toBeNull();
  });

  it("returns null when the cookie is missing", () => {
    expect(readCookie(jar, "missing")).toBeNull();
    expect(readCookie("", "dafit-theme")).toBeNull();
  });

  it("returns an empty value as an empty string", () => {
    expect(readCookie(jar, "empty")).toBe("");
  });

  it("keeps '=' inside values and decodes them", () => {
    expect(readCookie("token=a=b=c", "token")).toBe("a=b=c");
    expect(readCookie("name=%D0%90%D0%BD%D0%BD%D0%B0", "name")).toBe("Анна");
  });

  it("returns null for a value that does not decode", () => {
    expect(readCookie("bad=%E0%A4%A", "bad")).toBeNull();
  });

  it("reads back what preferenceCookie wrote", () => {
    for (const value of ["light", "a; b=c", "Тёмная", "100%"]) {
      const pair = preferenceCookie("pref", value, false).split("; ")[0];
      expect(readCookie(`other=1; ${pair}`, "pref")).toBe(value);
    }
  });
});
