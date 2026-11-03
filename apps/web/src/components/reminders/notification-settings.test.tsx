// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { NotificationSettings } from "./notification-settings";

const actions = vi.hoisted(() => ({
  setQuietHours: vi.fn(),
  setDefaultReminders: vi.fn(),
  setDigestTime: vi.fn(),
  setNotificationEnabled: vi.fn(),
  setPairReminders: vi.fn(),
}));
vi.mock("@/lib/reminders/actions", () => actions);

const DATA = {
  pairs: [],
  trainerDefaults: null,
  quietHours: { start: "22:30", end: "08:00" },
  digestTime: "08:00",
  disabled: [],
};

/** Start hours, start minutes, end hours, end minutes. */
const fields = () => screen.getAllByRole("combobox") as HTMLSelectElement[];

describe("NotificationSettings quiet hours (QA 49)", () => {
  beforeEach(() => actions.setQuietHours.mockReset());

  it("keeps both changes made one after another when the first save fails", async () => {
    let failFirst: (value: { ok: boolean }) => void = () => {};
    actions.setQuietHours
      .mockImplementationOnce(() => new Promise((resolve) => (failFirst = resolve)))
      .mockResolvedValueOnce({ ok: true });
    renderWithProviders(<NotificationSettings data={DATA} />);

    fireEvent.change(fields()[1], { target: { value: "00" } });
    fireEvent.change(fields()[2], { target: { value: "07" } });
    expect(actions.setQuietHours).toHaveBeenNthCalledWith(1, { start: "22:00", end: "08:00" });
    expect(actions.setQuietHours).toHaveBeenNthCalledWith(2, { start: "22:00", end: "07:00" });

    await act(async () => failFirst({ ok: false }));
    expect(fields().map((field) => field.value)).toEqual(["22", "00", "07", "00"]);
  });

  it("rolls the fields back when the latest save fails", async () => {
    actions.setQuietHours.mockResolvedValueOnce({ ok: false });
    renderWithProviders(<NotificationSettings data={DATA} />);

    await act(async () => {
      fireEvent.change(fields()[1], { target: { value: "00" } });
    });
    expect(fields().map((field) => field.value)).toEqual(["22", "30", "08", "00"]);
  });
});
