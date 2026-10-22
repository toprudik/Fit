// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { zoneOptions } = await import("./step-fields");

describe("zoneOptions", () => {
  it("puts a saved zone the runtime does not list first, so saving the step keeps it", () => {
    const options = zoneOptions("Etc/GMT-3");
    expect(options[0]).toEqual({ id: "Etc/GMT-3", label: "Etc/GMT-3 (GMT+3)" });
    expect(options.filter((option) => option.id === "Etc/GMT-3")).toHaveLength(1);
  });

  it("does not repeat a listed zone", () => {
    const options = zoneOptions("Europe/Moscow");
    expect(options.filter((option) => option.id === "Europe/Moscow")).toHaveLength(1);
    expect(options[0].id).not.toBe("Europe/Moscow");
  });
});
