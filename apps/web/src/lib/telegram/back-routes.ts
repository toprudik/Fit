import { tabsForZone, zoneFromPath } from "@/lib/navigation/zones";

/** Screens the Mini App opens on with nothing behind them: the way in and its first steps. */
const ENTRY_SCREENS = new Set(["/", "/login"]);
const ENTRY_PREFIXES = ["/onboarding"];

/** Screens with screens of their own below them: "Back" from those goes up to them. */
const SECTIONS = ["/settings", "/admin"];

/**
 * Where Telegram's BackButton goes up to from `pathname` when the screen did not say (and the app has
 * no earlier screen of its own to go back to); null on a root, where the button stays hidden. Roots
 * are the tab roots of the zones and the entry screens. Everything else gets the button: a
 * screen of a tab goes up to the tab, a screen of a zone outside its tabs to the zone's home, a
 * screen of settings or the admin panel to that section, any other screen to "/", which opens the
 * last zone. The onboarding wizard has a "Back" of its own on every step.
 */
export function backFallbackHref(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (ENTRY_SCREENS.has(path) || ENTRY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null;

  const zone = zoneFromPath(path);
  if (zone) {
    const tabs = tabsForZone(zone);
    if (tabs.some((tab) => tab.href === path)) return null;
    const tab = tabs.find((candidate) => candidate.segment !== null && path.startsWith(`${candidate.href}/`));
    return tab ? tab.href : `/${zone}`;
  }

  const section = SECTIONS.find((prefix) => path.startsWith(`${prefix}/`));
  return section ?? "/";
}
