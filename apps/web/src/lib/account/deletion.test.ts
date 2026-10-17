import { describe, expect, it } from "vitest";
import { DELETION_PATH, deletionRedirect, isDeletionPending } from "./deletion";

describe("isDeletionPending", () => {
  it("reads the mark from app_metadata", () => {
    expect(isDeletionPending({ app_metadata: { deletion_pending: true, telegram_id: 1 } })).toBe(true);
  });

  it("is false without the mark or with anything but true", () => {
    expect(isDeletionPending({ app_metadata: { telegram_id: 1 } })).toBe(false);
    expect(isDeletionPending({ app_metadata: { deletion_pending: "true" } })).toBe(false);
    expect(isDeletionPending({})).toBe(false);
    expect(isDeletionPending(null)).toBe(false);
  });
});

describe("deletionRedirect", () => {
  it("keeps the deletion, export, login and terms screens open", () => {
    expect(deletionRedirect("/settings/delete")).toBeNull();
    expect(deletionRedirect("/settings/export")).toBeNull();
    expect(deletionRedirect("/login")).toBeNull();
    expect(deletionRedirect("/onboarding/consent")).toBeNull();
  });

  it("sends every other screen to the deletion screen", () => {
    expect(deletionRedirect("/client")).toBe(DELETION_PATH);
    expect(deletionRedirect("/settings")).toBe(DELETION_PATH);
    expect(deletionRedirect("/settings/delete/x")).toBe(DELETION_PATH);
  });
});
