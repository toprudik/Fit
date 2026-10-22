// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import type { ZoneOption } from "./step-fields";
import { TimeZonePicker } from "./time-zone-picker";

const ZONES: ZoneOption[] = [
  { id: "Europe/Kaliningrad", label: "Europe/Kaliningrad", offset: "GMT+2", name: "Восточная Европа" },
  { id: "Europe/Moscow", label: "Europe/Moscow", offset: "GMT+3", name: "Москва" },
  { id: "Asia/Yekaterinburg", label: "Asia/Yekaterinburg", offset: "GMT+5", name: "Екатеринбург" },
];

function Picker() {
  const [zone, setZone] = useState("Europe/Kaliningrad");
  return (
    <form aria-label="form">
      <TimeZonePicker name="timeZone" label="Часовой пояс" zones={ZONES} value={zone} onChange={setZone} />
    </form>
  );
}

describe("TimeZonePicker", () => {
  it("searches the list in a sheet and sends the picked zone with the form", async () => {
    renderWithProviders(<Picker />);
    const field = screen.getByRole("button", { name: /Часовой пояс/ });
    expect(field.textContent).toBe("Europe/Kaliningrad (GMT+2)");

    fireEvent.click(field);
    fireEvent.change(await screen.findByRole("searchbox", { name: "Поиск" }), { target: { value: "моск" } });
    expect(screen.queryByText("Asia/Yekaterinburg")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Europe\/Moscow/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Часовой пояс/ }).textContent).toBe("Europe/Moscow (GMT+3)"));
    expect(new FormData(screen.getByRole<HTMLFormElement>("form")).get("timeZone")).toBe("Europe/Moscow");
  });

  it("says so when nothing matches", async () => {
    renderWithProviders(<Picker />);
    fireEvent.click(screen.getByRole("button", { name: /Часовой пояс/ }));
    fireEvent.change(await screen.findByRole("searchbox", { name: "Поиск" }), { target: { value: "qqqq" } });
    expect(screen.getByRole("status").textContent).toMatch(/Ничего не нашлось/);
  });
});
