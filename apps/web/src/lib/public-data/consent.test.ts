import { describe, expect, it } from "vitest";
import { conditionText, newPlaces, pickKnown, placeIds, PUBLIC_BANS, SHOWCASE_FIELDS } from "./consent";

describe("pickKnown", () => {
  it("keeps known values once each, in the order of the list", () => {
    expect(pickKnown(["prices", "phone", "photo", "prices"], SHOWCASE_FIELDS)).toEqual(["photo", "prices"]);
    expect(pickKnown(["no_index", 3, null], PUBLIC_BANS)).toEqual(["no_index"]);
    expect(pickKnown([], PUBLIC_BANS)).toEqual([]);
  });
});

describe("conditionText", () => {
  it("trims, treats blank as none and flags text over 500 characters", () => {
    expect(conditionText("  Не копировать фото  ")).toBe("Не копировать фото");
    expect(conditionText(" ")).toBeNull();
    expect(conditionText(undefined)).toBeNull();
    expect(conditionText("a".repeat(500))).toBe("a".repeat(500));
    expect(conditionText("a".repeat(501))).toBe("long");
  });
});

describe("placeIds", () => {
  it("keeps ids once each and drops anything else", () => {
    const id = "00000000-0000-4000-8000-00000000c001";
    expect(placeIds([id, id, "Тверская, 1", 7, ""])).toEqual([id]);
  });
});

describe("newPlaces", () => {
  const places = [
    { id: "00000000-0000-4000-8000-00000000c001", name: "Студия", address: "Баумана, 5" },
    { id: "00000000-0000-4000-8000-00000000c002", name: "Дом", address: null },
  ];
  it("lists the places the consent in force leaves private", () => {
    const consent = { fields: [], bans: [], condition: null, locationIds: [places[0].id], acceptedAt: "2026-10-20T10:00:00Z" };
    expect(newPlaces(places, consent).map((place) => place.name)).toEqual(["Дом"]);
    expect(newPlaces(places, null)).toEqual([]);
  });
});
