// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hapticSelection } from "@/lib/telegram/mini-app";
import { renderWithProviders } from "@/test/render";
import { SegmentedControl } from "./segmented-control";

vi.mock("@/lib/telegram/mini-app", () => ({ hapticSelection: vi.fn() }));

type Theme = "system" | "light" | "dark";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "Авто" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

/** Holds the value like a real caller does, so the tests see what the user sees after each change. */
function ThemeSwitch({ initial = "system", onChange }: { initial?: Theme; onChange?: (value: Theme) => void }) {
  const [value, setValue] = useState<Theme>(initial);
  return (
    <SegmentedControl
      label="Тема"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

function checked() {
  return screen.getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true");
}

describe("SegmentedControl", () => {
  beforeEach(() => {
    vi.mocked(hapticSelection).mockClear();
  });

  it("renders a labelled radio group with the current option checked", () => {
    renderWithProviders(<ThemeSwitch initial="light" />);

    expect(screen.getByRole("radiogroup", { name: "Тема" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Авто", "Светлая", "Тёмная"]);
    expect(checked().map((radio) => radio.textContent)).toEqual(["Светлая"]);
  });

  it("selects the pressed option, reports it and gives selection feedback", () => {
    const onChange = vi.fn();
    renderWithProviders(<ThemeSwitch onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Тёмная" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith("dark");
    expect(hapticSelection).toHaveBeenCalledOnce();
    expect(checked().map((radio) => radio.textContent)).toEqual(["Тёмная"]);
  });

  it("never ends up with nothing selected", () => {
    const onChange = vi.fn();
    renderWithProviders(<ThemeSwitch onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Авто" }));
    fireEvent.click(screen.getByRole("radio", { name: "Авто" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
    expect(checked().map((radio) => radio.textContent)).toEqual(["Авто"]);
  });

  it("is one tab stop that lands on the selected option, and the arrows move focus without selecting", async () => {
    const onChange = vi.fn();
    renderWithProviders(<ThemeSwitch initial="light" onChange={onChange} />);
    const [system, light, dark] = screen.getAllByRole("radio");

    expect([system.tabIndex, light.tabIndex, dark.tabIndex]).toEqual([-1, -1, -1]);
    screen.getByRole("radiogroup").focus();
    expect(document.activeElement).toBe(light);

    fireEvent.keyDown(light, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(dark));

    // Focus wraps around at the ends.
    fireEvent.keyDown(dark, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(system));

    fireEvent.keyDown(system, { key: "ArrowLeft" });
    await waitFor(() => expect(document.activeElement).toBe(dark));

    expect(onChange).not.toHaveBeenCalled();
    expect(checked().map((radio) => radio.textContent)).toEqual(["Светлая"]);

    // Space and Enter press the focused button, which browsers turn into a click.
    fireEvent.click(dark);
    expect(onChange).toHaveBeenCalledExactlyOnceWith("dark");
    expect(checked().map((radio) => radio.textContent)).toEqual(["Тёмная"]);
  });
});
