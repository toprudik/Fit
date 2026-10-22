// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { zoneOptions } = await import("./step-fields");
const { matchZones } = await import("./time-zone-picker");

describe("zoneOptions", () => {
  it("puts a saved zone the runtime does not list first, so saving the step keeps it", () => {
    const options = zoneOptions("Etc/GMT-3", "ru");
    expect(options[0]).toMatchObject({ id: "Etc/GMT-3", label: "Etc/GMT-3", offset: "GMT+3" });
    expect(options.filter((option) => option.id === "Etc/GMT-3")).toHaveLength(1);
  });

  it("does not repeat a listed zone", () => {
    const options = zoneOptions("Europe/Moscow", "ru");
    expect(options.filter((option) => option.id === "Europe/Moscow")).toHaveLength(1);
    expect(options[0].id).not.toBe("Europe/Moscow");
  });

  it("names a zone in the viewer's language, without the standard-time tail", () => {
    expect(zoneOptions(null, "ru").find((option) => option.id === "Europe/Moscow")?.name).toBe("Москва");
    expect(zoneOptions(null, "en").find((option) => option.id === "Europe/Moscow")?.name).toBe("Moscow");
  });
});

describe("matchZones", () => {
  const zones = zoneOptions(null, "ru");
  const ids = (query: string) => matchZones(zones, query).map((zone) => zone.id);

  it("finds a zone by its Russian name, its English city or its offset", () => {
    expect(ids("моск")).toContain("Europe/Moscow");
    expect(ids("Екатеринбург")).toContain("Asia/Yekaterinburg");
    expect(ids("new york")).toEqual(["America/New_York"]);
    expect(ids("+5")).toContain("Asia/Yekaterinburg");
  });

  it("returns the whole list for an empty query and nothing for nonsense", () => {
    expect(ids("  ")).toHaveLength(zones.length);
    expect(ids("qqqq")).toEqual([]);
  });
});
