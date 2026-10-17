// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { BookPicker } from "./book-picker";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const actions = vi.hoisted(() => ({
  bookGroupSession: vi.fn(),
  bookSlot: vi.fn(),
  joinWaitlist: vi.fn(),
  joinSlotWaitlist: vi.fn(async () => ({ status: "done" as const, entryId: "e1", place: 1 })),
  previewBooking: vi.fn(),
  previewGroupBooking: vi.fn(),
}));
vi.mock("@/lib/bookings/actions", () => actions);
vi.mock("@/lib/bookings/changes", () => ({ previewReschedule: vi.fn(), rescheduleBooking: vi.fn() }));

const SLOT = "2b3c4d5e-6f70-4a81-9b2c-3d4e5f607182";
const HELD = "3c4d5e6f-7081-4b92-8c3d-4e5f60718293";
const base = { mode: "offline" as const, place: "Студия" };

function picker(queueSlots: Parameters<typeof BookPicker>[0]["queueSlots"]) {
  return renderWithProviders(
    <BookPicker
      timeZone="UTC"
      days={["2026-11-02"]}
      slots={[{ id: HELD, startsAt: "2026-11-02T12:00:00Z", endsAt: "2026-11-02T13:00:00Z", ...base }]}
      groups={[]}
      queueSlots={queueSlots}
      busy={[]}
      dropInText={null}
      paymentLinks={[]}
    />,
  );
}

describe("BookPicker waitlist for slots", () => {
  it("lists a booked slot for the queue and hides a free slot held by an offer", async () => {
    picker([
      { id: SLOT, startsAt: "2026-11-02T10:00:00Z", endsAt: "2026-11-02T11:00:00Z", ...base, waiting: 0, myEntryId: null },
      { id: HELD, startsAt: "2026-11-02T12:00:00Z", endsAt: "2026-11-02T13:00:00Z", ...base, waiting: 1, myEntryId: null },
    ]);
    const rows = screen.getAllByText(/занято, можно встать в очередь/);
    expect(rows).toHaveLength(2);
    fireEvent.click(rows[0]);
    expect(await screen.findByText("В лист ожидания на это время?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "В лист ожидания" }));
    await waitFor(() => expect(actions.joinSlotWaitlist).toHaveBeenCalledWith(SLOT));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/client/waitlist/e1"));
  });

  it("links a slot the client already waits for to their entry", () => {
    picker([{ id: SLOT, startsAt: "2026-11-02T10:00:00Z", endsAt: "2026-11-02T11:00:00Z", ...base, waiting: 1, myEntryId: "e2" }]);
    expect(screen.getByText(/ты в очереди/).closest("a")?.getAttribute("href")).toBe("/client/waitlist/e2");
  });
});
