// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DayComment } from "@/lib/nutrition/diary-load";
import { renderWithProviders } from "@/test/render";
import { ClientComments } from "./client-comments";

vi.mock("@/lib/nutrition/diary-actions", () => ({ hideComment: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const COACHING = "8a1d6c3e-5b2f-4e7a-9c0d-1f2e3a4b5c6d";

function comment(overrides: Partial<DayComment>): DayComment {
  return {
    id: "c-1",
    coachingId: COACHING,
    body: "Добавь белка на завтрак",
    authorName: "Анна",
    authorId: "t-1",
    authorUsername: null,
    hidden: false,
    createdAt: "2026-10-17T09:00:00Z",
    ...overrides,
  };
}

describe("ClientComments", () => {
  it("answers in the Telegram chat with the trainer (§3.13)", () => {
    renderWithProviders(<ClientComments comments={[comment({ authorUsername: "anna_fit" })]} />);
    const reply = screen.getByRole("link", { name: "Ответить" });
    expect(reply.getAttribute("href")).toBe("https://t.me/anna_fit");
    expect(reply.getAttribute("target")).toBe("_blank");
  });

  it("opens the pair when the trainer has no username or an odd one", () => {
    renderWithProviders(<ClientComments comments={[comment({}), comment({ id: "c-2", authorUsername: "a b/../x" })]} />);
    const links = screen.getAllByRole("link", { name: "Ответить" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([`/client/trainers/${COACHING}`, `/client/trainers/${COACHING}`]);
  });
});
