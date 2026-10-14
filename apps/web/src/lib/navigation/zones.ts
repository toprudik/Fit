/**
 * Zones and their tab bars (docs/architecture/screens.md §1.6, §2.1, §2.2). The zone comes from the
 * path prefix, so any link opens the right zone. Pure data: the UI maps icon names to lucide-react.
 */
export const ZONES = ["trainer", "client"] as const;
export type Zone = (typeof ZONES)[number];

/** Cookie with the last opened zone; "/" redirects there (screens.md §1.6). */
export const ZONE_COOKIE = "dafit-zone";
/** New users land in the client zone, like user_settings.last_zone defaults (data-model.md). */
export const DEFAULT_ZONE: Zone = "client";

export type TrainerTabId = "today" | "schedule" | "clients" | "money" | "more";
export type ClientTabId = "home" | "sessions" | "diary" | "progress" | "trainers";
export type TabId = TrainerTabId | ClientTabId;

/** lucide-react icons used by the tab bar and the side menu (names as in docs/design/components/index.d.ts). */
export type TabIcon = "house" | "calendar-days" | "users" | "wallet" | "ellipsis" | "dumbbell" | "chart-line" | "user";

export type Tab<Z extends Zone = Zone> = {
  id: Z extends "trainer" ? TrainerTabId : ClientTabId;
  /** Child segment under /<zone>; null for the zone root. */
  segment: string | null;
  href: `/${Z}` | `/${Z}/${string}`;
  icon: TabIcon;
};

const TRAINER_TABS: readonly Tab<"trainer">[] = [
  { id: "today", segment: null, href: "/trainer", icon: "house" },
  { id: "schedule", segment: "schedule", href: "/trainer/schedule", icon: "calendar-days" },
  { id: "clients", segment: "clients", href: "/trainer/clients", icon: "users" },
  { id: "money", segment: "money", href: "/trainer/money", icon: "wallet" },
  { id: "more", segment: "more", href: "/trainer/more", icon: "ellipsis" },
];

const CLIENT_TABS: readonly Tab<"client">[] = [
  { id: "home", segment: null, href: "/client", icon: "house" },
  { id: "sessions", segment: "sessions", href: "/client/sessions", icon: "calendar-days" },
  { id: "diary", segment: "diary", href: "/client/diary", icon: "dumbbell" },
  { id: "progress", segment: "progress", href: "/client/progress", icon: "chart-line" },
  { id: "trainers", segment: "trainers", href: "/client/trainers", icon: "user" },
];

export function isZone(value: unknown): value is Zone {
  return typeof value === "string" && (ZONES as readonly string[]).includes(value);
}

export function tabsForZone(zone: Zone): readonly Tab[] {
  return zone === "trainer" ? TRAINER_TABS : CLIENT_TABS;
}

/** Zone of a URL path: "/trainer/clients/1" → "trainer"; paths outside zones → null. */
export function zoneFromPath(pathname: string): Zone | null {
  const first = pathname.split("/")[1];
  return isZone(first) ? first : null;
}

/**
 * Active tab from layout segments below the zone (useSelectedLayoutSegments in the zone layout):
 * [] → the root tab, ["clients", "42"] → "clients". Unknown segments select nothing.
 */
export function activeTab(zone: Zone, segments: readonly string[]): Tab | null {
  const first = segments[0] ?? null;
  return tabsForZone(zone).find((tab) => tab.segment === first) ?? null;
}

/** True on a tab's root screen, where the header shows the avatar instead of "Back". */
export function isTabRoot(zone: Zone, segments: readonly string[]): boolean {
  return segments.length <= 1 && activeTab(zone, segments) !== null;
}
