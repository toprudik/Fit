// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { TimeField } from "./time-field";

function form(props: Partial<React.ComponentProps<typeof TimeField>> = {}) {
  return renderWithProviders(
    <form aria-label="form">
      <TimeField label="Время" name="time" {...props} />
    </form>,
  );
}

const posted = () => new FormData(screen.getByRole<HTMLFormElement>("form")).get("time");

describe("TimeField", () => {
  it("posts 24-hour HH:MM, and an hour alone makes a time on the hour", () => {
    form();
    expect(posted()).toBe("");
    fireEvent.change(screen.getByRole("combobox", { name: "Часы" }), { target: { value: "18" } });
    expect(posted()).toBe("18:00");
    fireEvent.change(screen.getByRole("combobox", { name: "Минуты" }), { target: { value: "45" } });
    expect(posted()).toBe("18:45");
  });

  it("keeps a saved time that is off the five-minute step", () => {
    form({ defaultValue: "07:07" });
    expect(screen.getByRole("combobox", { name: "Минуты" })).toHaveProperty("value", "07");
    expect(posted()).toBe("07:07");
  });

  it("stops a form with an empty required time, in Russian", () => {
    form({ required: true });
    expect(screen.getByRole<HTMLFormElement>("form").checkValidity()).toBe(false);
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Часы" }).validationMessage).toBe("Выбери время");
  });
});
