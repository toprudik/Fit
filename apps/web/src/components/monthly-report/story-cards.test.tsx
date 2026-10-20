// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStoryCard } from "@/lib/monthly-report/actions";
import { givePublicConsent } from "@/lib/public-data/actions";
import { renderWithProviders } from "@/test/render";
import { StoryCards } from "./story-cards";

vi.mock("@/lib/monthly-report/actions", () => ({ createStoryCard: vi.fn(), shareMonthlyReport: vi.fn() }));
vi.mock("@/lib/public-data/actions", () => ({ givePublicConsent: vi.fn(), revokePublicConsent: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const CARD = "00000000-0000-4000-8000-000000000002";

describe("StoryCards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for the consent to publish before the first card, then makes it (152-FZ art. 10.1)", async () => {
    vi.mocked(createStoryCard).mockResolvedValueOnce({ status: "consent" }).mockResolvedValueOnce({ status: "created", id: CARD });
    vi.mocked(givePublicConsent).mockResolvedValue({ status: "done" });
    renderWithProviders(<StoryCards month="2026-09" options={[{ kind: "sessions" }]} />);

    fireEvent.click(screen.getByText("Занятия за месяц"));
    const sheet = await screen.findByRole("dialog", { name: "Согласие на публикацию" });
    expect(sheet).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Фото" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Даю согласие" }));
    await waitFor(() => expect(givePublicConsent).toHaveBeenCalledWith({ scope: "story", fields: [], bans: [], condition: null }));
    await waitFor(() => expect(createStoryCard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createStoryCard).mock.calls[1][0]).toEqual({ month: "2026-09", kind: "sessions", coachingId: undefined, confirm: false });
  });
});
