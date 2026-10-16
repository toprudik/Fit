import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminDeniedPath, consentRedirect, isAdminPath, PUBLIC_FILES, routeRequest, type RouteInput } from "./routing";

function route(overrides: Partial<RouteInput>) {
  return routeRequest({
    pathname: "/",
    search: "",
    localeCookie: null,
    zoneCookie: null,
    acceptLanguage: null,
    isDocument: true,
    ...overrides,
  });
}

describe("routeRequest: /", () => {
  it("sends new visitors to the client zone", () => {
    expect(route({ pathname: "/" })).toEqual({ kind: "redirect", location: "/client" });
  });

  it("sends returning visitors to their last zone", () => {
    expect(route({ pathname: "/", zoneCookie: "trainer" })).toEqual({ kind: "redirect", location: "/trainer" });
    expect(route({ pathname: "/", zoneCookie: "client" })).toEqual({ kind: "redirect", location: "/client" });
  });

  it("ignores a zone cookie it does not know", () => {
    expect(route({ pathname: "/", zoneCookie: "admin" })).toEqual({ kind: "redirect", location: "/client" });
  });

  it("keeps the query string, so deep link parameters survive", () => {
    expect(route({ pathname: "/", search: "?tgWebAppStartParam=tp_anna", zoneCookie: "trainer" })).toEqual({
      kind: "redirect",
      location: "/trainer?tgWebAppStartParam=tp_anna",
    });
  });
});

describe("routeRequest: pages", () => {
  it("serves the page under the negotiated locale", () => {
    expect(route({ pathname: "/settings" })).toEqual({ kind: "rewrite", pathname: "/ru/settings", locale: "ru", rememberZone: null });
    expect(route({ pathname: "/settings", acceptLanguage: "en-US,en;q=0.9" })).toMatchObject({ pathname: "/en/settings", locale: "en" });
  });

  it("lets the saved language win over the browser's", () => {
    expect(route({ pathname: "/login", localeCookie: "ru", acceptLanguage: "en-US" })).toMatchObject({ pathname: "/ru/login", locale: "ru" });
    expect(route({ pathname: "/login", localeCookie: "en", acceptLanguage: "ru-RU" })).toMatchObject({ pathname: "/en/login", locale: "en" });
  });

  it("ignores a saved language it does not support", () => {
    expect(route({ pathname: "/login", localeCookie: "de", acceptLanguage: "en" })).toMatchObject({ locale: "en" });
  });

  it("serves unknown paths too, so the app renders its own not-found page", () => {
    expect(route({ pathname: "/no/such/page" })).toMatchObject({ kind: "rewrite", pathname: "/ru/no/such/page" });
  });

  it("does not touch the query string (the proxy appends it)", () => {
    expect(route({ pathname: "/login", search: "?next=%2Ftrainer" })).toMatchObject({ pathname: "/ru/login" });
  });
});

describe("routeRequest: remembering the zone", () => {
  it("remembers a zone when the visit switches to it", () => {
    expect(route({ pathname: "/trainer" })).toMatchObject({ kind: "rewrite", rememberZone: "trainer" });
    expect(route({ pathname: "/trainer/clients/42", zoneCookie: "client" })).toMatchObject({ rememberZone: "trainer" });
    expect(route({ pathname: "/client/diary", zoneCookie: "trainer" })).toMatchObject({ rememberZone: "client" });
  });

  it("does not rewrite the cookie when the zone is already saved", () => {
    expect(route({ pathname: "/trainer/money", zoneCookie: "trainer" })).toMatchObject({ rememberZone: null });
  });

  it("remembers it only on document loads, not on router requests or prefetches", () => {
    expect(route({ pathname: "/trainer", isDocument: false })).toMatchObject({ kind: "rewrite", rememberZone: null });
  });

  it("does not remember pages outside zones", () => {
    expect(route({ pathname: "/settings", zoneCookie: "trainer" })).toMatchObject({ rememberZone: null });
    expect(route({ pathname: "/trainers/anna" })).toMatchObject({ rememberZone: null });
  });
});

describe("routeRequest: not pages", () => {
  it.each([
    "/api/auth/telegram/mini-app",
    "/auth/sign-out",
    "/auth/telegram/callback",
    "/_next/static/chunks/main.js",
    "/_next/data/x.json",
    "/__nextjs_original-stack-frame",
    "/favicon.ico",
    "/icon.svg",
    "/apple-icon.png",
    "/robots.txt",
  ])("passes %s through untouched", (pathname) => {
    expect(route({ pathname, acceptLanguage: "en" })).toEqual({ kind: "pass" });
  });

  it("does not redirect router requests for / differently", () => {
    expect(route({ pathname: "/", isDocument: false, zoneCookie: "trainer" })).toEqual({ kind: "redirect", location: "/trainer" });
  });

  it("treats other paths with a dot as pages, so they get the localized 404", () => {
    expect(route({ pathname: "/fonts/onest.woff2" })).toMatchObject({ kind: "rewrite", pathname: "/ru/fonts/onest.woff2" });
    expect(route({ pathname: "/client.old" })).toMatchObject({ kind: "rewrite", pathname: "/ru/client.old" });
  });
});

describe("PUBLIC_FILES", () => {
  it("lists exactly the files in apps/web/public (the proxy matcher excludes the same names)", () => {
    const files = readdirSync(join(__dirname, "../../../public")).map((name) => `/${name}`);
    expect([...PUBLIC_FILES].sort()).toEqual(files.sort());
  });
});

describe("the admin section", () => {
  it("covers /admin and everything under it, nothing else", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/invites")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/trainer/admin")).toBe(false);
  });

  it("sends non-admins to an unknown page of their language, which is the app's 404", () => {
    expect(adminDeniedPath("en")).toBe("/en/admin-not-found");
    expect(isAdminPath(adminDeniedPath("ru").slice(3))).toBe(false);
  });
});

describe("consentRedirect", () => {
  it("sends every screen to the beta terms with the screen in next", () => {
    expect(consentRedirect("/client", "")).toBe("/onboarding/consent?next=%2Fclient");
    expect(consentRedirect("/onboarding/trainer", "?code=ABCD")).toBe("/onboarding/consent?next=%2Fonboarding%2Ftrainer%3Fcode%3DABCD");
    expect(consentRedirect("/onboarding/preferences", "")).toBe("/onboarding/consent?next=%2Fonboarding%2Fpreferences");
    expect(consentRedirect("/admin/invites", "")).toBe("/onboarding/consent?next=%2Fadmin%2Finvites");
  });

  it("leaves the terms screen and the login screen open", () => {
    expect(consentRedirect("/onboarding/consent", "?next=%2Fclient")).toBeNull();
    expect(consentRedirect("/login", "?next=%2Fclient")).toBeNull();
  });
});
