import { describe, expect, it } from "vitest";
import { showcaseFrom } from "./load";

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
