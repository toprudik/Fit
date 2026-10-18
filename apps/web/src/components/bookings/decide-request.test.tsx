// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { renderWithProviders } from "@/test/render";
import { DecideRequest } from "./decide-request";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/bookings/actions", () => ({ decideRequest: vi.fn(async () => ({ status: "done" })) }));
const single = vi.hoisted(() => ({ confirmRequestSingle: vi.fn(async () => ({ status: "done" as const })) }));
vi.mock("@/lib/bookings/single", () => single);

const BOOKING = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const copy = ru.schedule.requests;

describe("DecideRequest", () => {
  it("offers a single session only when no pass covers the request", () => {
    renderWithProviders(<DecideRequest bookingId={BOOKING} />);
    expect(screen.queryByRole("button", { name: copy.confirmSingle })).toBeNull();
  });

  it("confirms as a single session under the pass title of the form", async () => {
    renderWithProviders(<DecideRequest bookingId={BOOKING} single />);
    fireEvent.click(screen.getByRole("button", { name: copy.confirmSingle }));
    await waitFor(() =>
      expect(single.confirmRequestSingle).toHaveBeenCalledWith({ bookingId: BOOKING, title: ru.schedule.sessionForm.singleTitle }),
    );
  });
});
