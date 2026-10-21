// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { createMomentCard } from "@/lib/moments/actions";
import { givePublicConsent } from "@/lib/public-data/actions";
import { renderWithProviders } from "@/test/render";
import { MomentShare } from "./moment-share";

vi.mock("@/lib/moments/actions", () => ({ createMomentCard: vi.fn() }));
vi.mock("@/lib/public-data/actions", () => ({ givePublicConsent: vi.fn(), revokePublicConsent: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const MILESTONE = "00000000-0000-4000-8000-000000000001";
const CARD = "00000000-0000-4000-8000-000000000002";

describe("MomentShare", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes the card of the milestone and shows its picture", async () => {
    vi.mocked(createMomentCard).mockResolvedValue({ status: "created", id: CARD });
    renderWithProviders(<MomentShare kind="milestone" momentRef={MILESTONE} label="10 занятий вместе" />);

    fireEvent.click(screen.getByRole("button", { name: "Поделиться: 10 занятий вместе" }));
    await waitFor(() => expect(createMomentCard).toHaveBeenCalledWith({ kind: "milestone", ref: MILESTONE }));
    const picture = await screen.findByRole("img", { name: "Карточка для сторис" });
    expect(picture.getAttribute("src")).toContain(`/api/story/${CARD}?theme=`);
  });

  it("asks for the consent to publish before the first card, then makes it (152-FZ art. 10.1)", async () => {
    vi.mocked(createMomentCard).mockResolvedValueOnce({ status: "consent" }).mockResolvedValueOnce({ status: "created", id: CARD });
    vi.mocked(givePublicConsent).mockResolvedValue({ status: "done" });
    renderWithProviders(<MomentShare kind="badge" momentRef="sessions_10" label="10 занятий" />);

    fireEvent.click(screen.getByRole("button", { name: "Поделиться: 10 занятий" }));
    await screen.findByRole("dialog", { name: "Согласие на публикацию" });
    fireEvent.click(screen.getByRole("button", { name: "Даю согласие" }));
    await waitFor(() => expect(createMomentCard).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createMomentCard).mock.calls[1][0]).toEqual({ kind: "badge", ref: "sessions_10" });
  });

  it("says so when the card could not be made", async () => {
    vi.mocked(createMomentCard).mockResolvedValue({ status: "failed" });
    renderWithProviders(<MomentShare kind="badge" momentRef="sessions_10" label="10 занятий" />);
    fireEvent.click(screen.getByRole("button", { name: "Поделиться: 10 занятий" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Не получилось сделать карточку, попробуй ещё раз."));
  });
});
