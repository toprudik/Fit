import { describe, expect, it, vi } from "vitest";
import { cookieAttributes } from "./cookie-attributes";
import {
  PREFERENCE_MAX_AGE,
  PREFERENCES_ENDPOINT,
  preferenceCookie,
  preferenceCookieOptions,
  readCookie,
  saveAccountPreferences,
} from "./preferences";

describe("preference cookies", () => {
  it("last a year", () => {
    expect(PREFERENCE_MAX_AGE).toBe(31_536_000);
  });

  it("are readable by the pre-paint script and the proxy", () => {
    expect(preferenceCookieOptions).toMatchObject({ path: "/", maxAge: PREFERENCE_MAX_AGE, httpOnly: false });
  });

  it("carry the build's cookie attributes", () => {
    expect(preferenceCookieOptions).toMatchObject(cookieAttributes(process.env.NODE_ENV === "production"));
  });

  it("are SameSite=None, Secure and Partitioned in production, so Telegram Web's iframe keeps them", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const production = await import("./preferences");
    vi.unstubAllEnvs();

    expect(production.preferenceCookieOptions).toMatchObject({ sameSite: "none", secure: true, partitioned: true });
    expect(production.preferenceCookie("dafit-theme", "light")).toBe("dafit-theme=light; Path=/; Max-Age=31536000; SameSite=None; Secure; Partitioned");
  });
});

describe("preferenceCookie", () => {
  it("builds a document.cookie string for the whole site", () => {
    expect(preferenceCookie("dafit-theme", "light", false)).toBe("dafit-theme=light; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it("matches what the server sets in production: SameSite=None, Secure, Partitioned", () => {
    expect(preferenceCookie("dafit-locale", "en", true)).toBe("dafit-locale=en; Path=/; Max-Age=31536000; SameSite=None; Secure; Partitioned");
  });

  it("follows the build by default, like the server's cookies", () => {
    // A cookie the browser writes must carry the same attributes as the one the server wrote, or
    // the two live side by side: a partitioned cookie is replaced only by a partitioned one.
    expect(preferenceCookie("dafit-zone", "trainer")).toBe(preferenceCookie("dafit-zone", "trainer", process.env.NODE_ENV === "production"));
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

describe("saveAccountPreferences", () => {
  it("sends the patch to the account and survives a failed request", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveAccountPreferences({ theme: "light" });
    expect(fetchMock).toHaveBeenCalledWith(
      PREFERENCES_ENDPOINT,
      expect.objectContaining({ method: "PATCH", body: '{"theme":"light"}', keepalive: true }),
    );

    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(saveAccountPreferences({ locale: "en" })).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
