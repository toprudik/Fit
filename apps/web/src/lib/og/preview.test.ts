import { describe, expect, it } from "vitest";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";
import { isPreviewKind, PREVIEW_KINDS, previewImagePath, previewMetadata, previewText } from "./preview";

const TRAINER = { name: "Анна Смирнова", headline: "Силовые и мобильность" };

describe("link previews", () => {
  it("knows the five shared links", () => {
    expect(PREVIEW_KINDS.every(isPreviewKind)).toBe(true);
    expect(isPreviewKind("story")).toBe(false);
  });

  it("names the trainer when the link leads to one and stays generic otherwise", () => {
    expect(previewText(ru, { kind: "showcase", trainer: TRAINER }).title).toBe("Анна Смирнова, тренер в DaFit");
    expect(previewText(ru, { kind: "showcase", trainer: null }).title).toBe(ru.linkPreview.showcase.generic);
    expect(previewText(en, { kind: "client", trainer: TRAINER }).title).toBe("Анна Смирнова invites you to DaFit");
    expect(previewText(ru, { kind: "trainer-invite", trainer: null }).title).toBe(ru.linkPreview.trainerInvite.generic);
    expect(previewText(ru, { kind: "for-trainers", trainer: null }).title).toBe(ru.linkPreview.forTrainers.generic);
  });

  it("adds a trial's length to the line above the title", () => {
    expect(previewText(ru, { kind: "trial", trainer: TRAINER, minutes: 60 }).kicker).toBe("Пробное занятие · 60 мин");
    expect(previewText(ru, { kind: "trial", trainer: null, minutes: null }).kicker).toBe("Пробное занятие");
  });

  it("points at the image route, not the localized page path", () => {
    expect(previewImagePath("referral", "abc", "en")).toBe("/api/og/referral?lang=en&id=abc");
    expect(previewImagePath("trainer-invite", null, "ru")).toBe("/api/og/trainer-invite?lang=ru");
  });

  it("gives Open Graph and the large card an absolute 1200×630 image and leaves title and robots to the page", () => {
    const metadata = previewMetadata(ru, { kind: "trial", trainer: TRAINER }, "tok", "ru", "https://dafit.example");
    const image = { url: "https://dafit.example/api/og/trial?lang=ru&id=tok", width: 1200, height: 630, alt: "Пробное занятие: Анна Смирнова" };
    expect(metadata.description).toBe(ru.linkPreview.trial.description);
    expect(metadata.openGraph).toMatchObject({ title: image.alt, locale: "ru_RU", siteName: "DaFit", images: [image] });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", images: [image] });
    expect(metadata).not.toHaveProperty("title");
    expect(metadata).not.toHaveProperty("robots");
  });
});
