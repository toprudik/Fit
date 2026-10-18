import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { backFallbackHref } from "./back-routes";

const APP = join(__dirname, "..", "..", "app", "[lang]");

/** Every screen as a URL pattern: route groups dropped, a dynamic segment kept as "[name]". */
function screens(dir = APP): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...screens(path));
    else if (entry.name === "page.tsx") {
      const segments = relative(APP, dir)
        .split(sep)
        .filter((segment) => segment && !/^\(.+\)$/.test(segment));
      found.push(`/${segments.join("/")}`);
    }
  }
  return found.sort();
}

const patterns = screens();
const sample = (pattern: string) => pattern.replace(/\[[^\]]+\]/g, "x1");
/** "/" has no page: the proxy sends it to the last zone (src/proxy.ts). The catch-all is the not-found screen. */
const isScreen = (path: string) =>
  path === "/" ||
  patterns
    .filter((pattern) => !pattern.includes("[..."))
    .some((pattern) => new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, "[^/]+")}$`).test(path));

/*
 * Telegram's BackButton in the Mini App, pressed again and again from any screen opened by a link (no history of
 * its own): every press lands on a screen the app has, and a few presses reach a root, where the button hides.
 */
describe("Telegram's BackButton from a screen opened by a link", () => {
  it.each(patterns.map((pattern) => [pattern]))("%s goes up to real screens and reaches a root", (pattern) => {
    let path = sample(pattern);
    const visited = [path];
    for (let presses = 0; presses < 4; presses += 1) {
      const next = backFallbackHref(path);
      if (next === null) return;
      expect(isScreen(next), `${path} goes up to ${next}, which no screen answers`).toBe(true);
      expect(visited, `${path} goes back to where it came from`).not.toContain(next);
      visited.push(next);
      path = next;
    }
    throw new Error(`no root after 4 presses: ${visited.join(" → ")}`);
  });

  it("never goes up to an address with a locale, which the proxy adds itself (ADR 0015)", () => {
    for (const pattern of patterns) expect(backFallbackHref(sample(pattern)) ?? "/").not.toMatch(/^\/(ru|en)(\/|$)/);
  });
});
