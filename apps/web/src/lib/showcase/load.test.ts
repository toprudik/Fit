import { describe, expect, it } from "vitest";
import { showcaseFrom, showcasePricesFrom } from "./load";

const AVAILABLE = {
  status: "available",
  slug: "anna",
  name: "Анна",
  photo_url: "https://t.me/i/userpic/anna.jpg",
  headline: "Силовые",
  bio: "8 лет в зале",
  specialties: ["strength"],
  city: "Москва",
  works_offline: true,
  works_online: false,
  verified: true,
  locations: [{ name: "Зал", address: "Тверская, 1" }, { name: "Парк", address: null }, { address: "без названия" }, "мусор"],
  is_own: false,
  coaching_id: null,
};

describe("showcaseFrom", () => {
  it("reads an open showcase and keeps only well-formed locations", () => {
    expect(showcaseFrom(AVAILABLE as never)).toEqual({
      slug: "anna",
      name: "Анна",
      photoUrl: "https://t.me/i/userpic/anna.jpg",
      headline: "Силовые",
      bio: "8 лет в зале",
      specialties: ["strength"],
      city: "Москва",
      worksOffline: true,
      worksOnline: false,
      verified: true,
      locations: [
        { name: "Зал", address: "Тверская, 1" },
        { name: "Парк", address: null },
      ],
      isOwn: false,
      coachingId: null,
    });
  });

  it("is null for an unavailable showcase or no answer", () => {
    expect(showcaseFrom({ status: "unavailable" } as never)).toBeNull();
    expect(showcaseFrom(undefined)).toBeNull();
  });
});

describe("showcasePricesFrom", () => {
  it("keeps complete rows and drops broken ones", () => {
    const row = {
      title: "10 занятий",
      applies_to: "any" as const,
      sessions_count: 10,
      price_minor: 1600000,
      currency: "RUB",
      per_session_minor: 160000,
      validity_days: 90,
      savings_pct: 20,
      is_best_value: true,
    };
    expect(showcasePricesFrom([row, { ...row, price_minor: null as unknown as number }])).toEqual([
      {
        key: "0",
        title: "10 занятий",
        sessionsCount: 10,
        priceMinor: 1600000,
        currency: "RUB",
        perSessionMinor: 160000,
        savingsPct: 20,
        isBestValue: true,
        validityDays: 90,
      },
    ]);
    expect(showcasePricesFrom(null)).toEqual([]);
  });
});
