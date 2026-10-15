import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import { LOCALES } from "@/i18n/config";
import { activeTab, DEFAULT_ZONE, isTabRoot, isZone, tabsForZone, ZONE_COOKIE, ZONES, zoneFromPath, type TabIcon } from "./zones";

const ICONS: readonly TabIcon[] = ["house", "calendar-days", "users", "wallet", "ellipsis", "dumbbell", "chart-line", "user"];

describe("zones", () => {
  it("has the trainer and client zones, client for new users", () => {
    expect(ZONES).toEqual(["trainer", "client"]);
    expect(DEFAULT_ZONE).toBe("client");
    expect(ZONE_COOKIE).toBe("dafit-zone");
  });

  it.each([
    ["trainer", true],
    ["client", true],
    ["admin", false],
    ["Trainer", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("isZone(%j) is %s", (value, expected) => {
    expect(isZone(value)).toBe(expected);
  });
});

describe("tabsForZone", () => {
  // screens.md §2.1 and §2.2: the tab bars, in this order.
  it("gives the trainer Today, Schedule, Clients, Money, More", () => {
    expect(tabsForZone("trainer").map(({ id, segment, href, icon }) => ({ id, segment, href, icon }))).toEqual([
      { id: "today", segment: null, href: "/trainer", icon: "house" },
      { id: "schedule", segment: "schedule", href: "/trainer/schedule", icon: "calendar-days" },
      { id: "clients", segment: "clients", href: "/trainer/clients", icon: "users" },
      { id: "money", segment: "money", href: "/trainer/money", icon: "wallet" },
      { id: "more", segment: "more", href: "/trainer/more", icon: "ellipsis" },
    ]);
  });

  it("gives the client Home, Sessions, Diary, Progress, Trainers", () => {
    expect(tabsForZone("client").map(({ id, segment, href, icon }) => ({ id, segment, href, icon }))).toEqual([
      { id: "home", segment: null, href: "/client", icon: "house" },
      { id: "sessions", segment: "sessions", href: "/client/sessions", icon: "calendar-days" },
      { id: "diary", segment: "diary", href: "/client/diary", icon: "dumbbell" },
      { id: "progress", segment: "progress", href: "/client/progress", icon: "chart-line" },
      { id: "trainers", segment: "trainers", href: "/client/trainers", icon: "user" },
    ]);
  });

  describe.each(ZONES)("%s zone", (zone) => {
    const tabs = tabsForZone(zone);

    it("fits the tab bar: at most five tabs", () => {
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs.length).toBeLessThanOrEqual(5);
    });

    it("starts with the zone root and has exactly one", () => {
      expect(tabs[0]).toMatchObject({ segment: null, href: `/${zone}` });
      expect(tabs.filter((tab) => tab.segment === null)).toHaveLength(1);
    });

    it("links every tab under the zone, one segment deep", () => {
      for (const tab of tabs) {
        expect(tab.href).toBe(tab.segment === null ? `/${zone}` : `/${zone}/${tab.segment}`);
        expect(zoneFromPath(tab.href)).toBe(zone);
        expect(tab.segment ?? "").toMatch(/^[a-z-]*$/);
      }
    });

    it("has unique ids, segments and hrefs", () => {
      for (const field of ["id", "segment", "href"] as const) {
        const values = tabs.map((tab) => tab[field]);
        expect(new Set(values).size, field).toBe(values.length);
      }
    });

    it("uses known icons", () => {
      for (const tab of tabs) expect(ICONS).toContain(tab.icon);
    });

    it.each(LOCALES)("has a %s label for every tab", (locale) => {
      const labels: Record<string, string> = dictionaries[locale].tabs[zone];
      expect(Object.keys(labels).sort()).toEqual(tabs.map((tab) => tab.id).sort());
    });
  });
});

describe("zoneFromPath", () => {
  it.each([
    ["/trainer", "trainer"],
    ["/trainer/clients/1", "trainer"],
    ["/client", "client"],
    ["/client/", "client"],
    ["/", null],
    ["", null],
    ["/settings", null],
    ["/trainers/anna", null],
    ["/trainerx", null],
    ["/ru/trainer", null],
  ])("%j → %j", (path, expected) => {
    expect(zoneFromPath(path)).toBe(expected);
  });
});

describe("activeTab", () => {
  it("selects the root tab on the zone root", () => {
    expect(activeTab("trainer", [])?.id).toBe("today");
    expect(activeTab("client", [])?.id).toBe("home");
  });

  it("selects the tab of the first segment, however deep the page", () => {
    expect(activeTab("trainer", ["clients"])?.id).toBe("clients");
    expect(activeTab("trainer", ["clients", "42"])?.id).toBe("clients");
    expect(activeTab("client", ["sessions", "7", "edit"])?.id).toBe("sessions");
  });

  it("selects nothing for unknown segments or another zone's tabs", () => {
    expect(activeTab("trainer", ["unknown"])).toBeNull();
    expect(activeTab("trainer", ["diary"])).toBeNull();
    expect(activeTab("client", ["money"])).toBeNull();
  });
});

describe("isTabRoot", () => {
  it.each([
    ["trainer", [], true],
    ["trainer", ["clients"], true],
    ["trainer", ["clients", "42"], false],
    ["client", ["progress"], true],
    ["client", ["progress", "weight"], false],
    ["trainer", ["unknown"], false],
    ["client", ["money"], false],
  ] as const)("%s %j → %s", (zone, segments, expected) => {
    expect(isTabRoot(zone, segments)).toBe(expected);
  });
});
