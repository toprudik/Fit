// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { ShowcaseProfile } from "./showcase-profile";

const NAME_ONLY = {
  slug: "nina-fit",
  name: "Нина",
  photoUrl: null,
  headline: null,
  bio: null,
  specialties: [],
  city: null,
  worksOffline: false,
  worksOnline: false,
  verified: false,
  locations: [],
  isOwn: false,
  coachingId: null,
};

describe("ShowcaseProfile", () => {
  it("shows only the name when the trainer published nothing else, with no empty sections (152-FZ art. 10.1)", () => {
    const { container } = render(<ShowcaseProfile t={ru} showcase={NAME_ONLY} prices={[]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Нина" })).toBeTruthy();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
    expect(container.querySelectorAll("section")).toHaveLength(0);
    expect(container.querySelector("img")).toBeNull();
  });
});
