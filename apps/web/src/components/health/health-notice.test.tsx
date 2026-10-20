// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/components/ui/sonner";
import { acknowledgeHealthNotice } from "@/lib/health-notice/actions";
import { renderWithProviders } from "@/test/render";
import { HealthNotice } from "./health-notice";

vi.mock("@/lib/health-notice/actions", () => ({ acknowledgeHealthNotice: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("HealthNotice", () => {
  beforeEach(() => {
    vi.mocked(acknowledgeHealthNotice).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("says when a doctor comes first, links the full text and closes with Понятно", async () => {
    vi.mocked(acknowledgeHealthNotice).mockResolvedValue(undefined);
    renderWithProviders(<HealthNotice />);
    expect(screen.getByRole("heading", { name: "Сначала о здоровье" })).toBeTruthy();
    expect(screen.getByText(/звони 112 или 103/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Полный текст" }).getAttribute("href")).toBe("/legal/health");
    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    await waitFor(() => expect(acknowledgeHealthNotice).toHaveBeenCalledOnce());
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says so when saving fails", async () => {
    vi.mocked(acknowledgeHealthNotice).mockRejectedValue(new Error("offline"));
    renderWithProviders(<HealthNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Понятно" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Не получилось сохранить, попробуй ещё раз."));
  });
});
