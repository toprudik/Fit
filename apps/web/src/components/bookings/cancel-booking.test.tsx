// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { CancelBooking } from "./cancel-booking";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const changes = vi.hoisted(() => ({
  cancelBooking: vi.fn(),
  previewCancel: vi.fn(async () => ({ kind: "free" as const })),
}));
vi.mock("@/lib/bookings/changes", () => changes);

const BOOKING = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("CancelBooking", () => {
  beforeEach(() => changes.previewCancel.mockClear());

  it("stays closed until the button is tapped", () => {
    renderWithProviders(<CancelBooking bookingId={BOOKING} late={false} deadline={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(changes.previewCancel).not.toHaveBeenCalled();
  });

  it("opens at once from the bot's «Отменить», with the cost after the deadline", async () => {
    renderWithProviders(<CancelBooking bookingId={BOOKING} late deadline="16 октября, 18:00" defaultOpen />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(changes.previewCancel).toHaveBeenCalledWith(BOOKING));
  });
});
