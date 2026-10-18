// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveReview } from "@/lib/reviews/actions";
import { renderWithProviders } from "@/test/render";
import { ReviewButton } from "./review-form";

vi.mock("@/lib/reviews/actions", () => ({ saveReview: vi.fn(), deleteReview: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PAIR = "00000000-0000-4000-8000-000000000011";

describe("ReviewButton", () => {
  beforeEach(() => vi.mocked(saveReview).mockReset().mockResolvedValue({ ok: true }));

  it("needs a rating, then sends it with the text and says who sees it", async () => {
    renderWithProviders(<ReviewButton coachingId={PAIR} current={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Оставить отзыв" }));
    expect(await screen.findByText("Отзыв видят тренер и команда DaFit.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Выбери оценку")).toBeTruthy();
    expect(saveReview).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "4 из 5" }));
    fireEvent.change(screen.getByLabelText("Отзыв"), { target: { value: " Объясняет понятно " } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    await waitFor(() => expect(saveReview).toHaveBeenCalledWith({ coachingId: PAIR, rating: 4, body: "Объясняет понятно" }));
  });

  it("opens an existing review for editing", async () => {
    renderWithProviders(<ReviewButton coachingId={PAIR} current={{ rating: 5, body: "Супер" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Изменить" }));
    expect(((await screen.findByRole("radio", { name: "5 из 5" })) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Отзыв") as HTMLTextAreaElement).value).toBe("Супер");
  });
});
