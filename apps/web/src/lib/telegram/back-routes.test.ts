import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { backFallbackHref } from "./back-routes";

const APP = join(__dirname, "..", "..", "app", "[lang]");

/** Every screen of the app as a URL: route groups dropped, a sample value in each dynamic segment. */
function screens(dir = APP): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...screens(path));
    else if (entry.name === "page.tsx") {
      const segments = relative(APP, dir)
        .split(sep)
        .filter((segment) => segment && !/^\(.+\)$/.test(segment))
        .map((segment) => (segment.startsWith("[") ? "x1" : segment));
      found.push(`/${segments.join("/")}`);
    }
  }
  return found.sort();
}

/**
 * The only screens without Telegram's BackButton: the five tabs of each zone and the way in. A new screen gets
 * the button by itself; adding one here needs a reason, since in the Mini App a screen without
 * "Back" can only be left by closing the app.
 */
const ROOTS = [
  "/",
  "/client",
  "/client/diary",
  "/client/progress",
  "/client/sessions",
  "/client/trainers",
  "/login",
  "/onboarding/consent",
  "/onboarding/preferences",
  "/onboarding/trainer/done",
  "/onboarding/trainer/x1",
  "/trainer",
  "/trainer/clients",
  "/trainer/money",
  "/trainer/more",
  "/trainer/schedule",
];

describe("Telegram's BackButton", () => {
  const all = screens();

  it("finds the screens", () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all).toContain("/client/diary/food/foods/x1");
  });

  it("shows on every screen but the roots", () => {
    expect(all.filter((screen) => backFallbackHref(screen) === null)).toEqual(ROOTS.filter((root) => all.includes(root)));
  });

  it("goes up to the tab, the zone's home or the section", () => {
    expect(backFallbackHref("/client/diary/food/add")).toBe("/client/diary");
    expect(backFallbackHref("/trainer/clients/x1/payments")).toBe("/trainer/clients");
    expect(backFallbackHref("/client/bookings/x1")).toBe("/client");
    expect(backFallbackHref("/trainer/analytics")).toBe("/trainer");
    expect(backFallbackHref("/settings/notifications")).toBe("/settings");
    expect(backFallbackHref("/admin/users/x1")).toBe("/admin");
    expect(backFallbackHref("/settings")).toBe("/");
    expect(backFallbackHref("/trainers/some-coach")).toBe("/");
    expect(backFallbackHref("/onboarding/trainer")).toBe("/");
  });

  it("shows on an address no screen answers, so the not-found screen has a way back", () => {
    expect(backFallbackHref("/client/nothing-here")).toBe("/client");
    expect(backFallbackHref("/nothing-here")).toBe("/");
  });

  it("ignores a trailing slash", () => {
    expect(backFallbackHref("/client/")).toBeNull();
    expect(backFallbackHref("/client/diary/food/")).toBe("/client/diary");
  });
});
