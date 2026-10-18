// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { shareMonthlyReport } from "@/lib/monthly-report/actions";
import { renderWithProviders } from "@/test/render";
import { ForwardToTrainer } from "./forward";

vi.mock("@/lib/monthly-report/actions", () => ({ shareMonthlyReport: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const targets = [
  { coachingId: "c1", name: "Ира", sharedAt: null },
  { coachingId: "c2", name: "Олег", sharedAt: "2026-10-02T09:00:00Z" },
];

describe("ForwardToTrainer", () => {
  beforeEach(() => vi.mocked(shareMonthlyReport).mockReset());

  it("sends the month to the trainer that was tapped", async () => {
    vi.mocked(shareMonthlyReport).mockResolvedValue({ status: "sent" });
    renderWithProviders(<ForwardToTrainer month="2026-09" targets={targets} />);
    expect(screen.getByText("Отправлено")).toBeTruthy();

    fireEvent.click(screen.getByText("Ира"));
    await waitFor(() => expect(screen.getAllByText("Отправлено")).toHaveLength(2));
    expect(shareMonthlyReport).toHaveBeenCalledWith({ month: "2026-09", coachingId: "c1" });
    expect(toast.success).toHaveBeenCalledWith("Итоги у тренера");
  });

  it("says when sending failed", async () => {
    vi.mocked(shareMonthlyReport).mockResolvedValue({ status: "failed" });
    renderWithProviders(<ForwardToTrainer month="2026-09" targets={targets} />);
    fireEvent.click(screen.getByText("Ира"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Не получилось отправить, попробуй ещё раз."));
    expect(screen.getByText("Отправить")).toBeTruthy();
  });

  it("shows nothing without a live pair", () => {
    const { container } = renderWithProviders(<ForwardToTrainer month="2026-09" targets={[]} />);
    expect(container.textContent).toBe("");
  });
});
