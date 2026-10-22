// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { DateField, monthWeeks } from "./date-field";

describe("monthWeeks", () => {
  it("lays a month out in weeks from Monday", () => {
    // 1 October 2026 is a Thursday.
    const weeks = monthWeeks("2026-10");
    expect(weeks[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.at(-1)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});

function form(props: Partial<React.ComponentProps<typeof DateField>> = {}) {
  return renderWithProviders(
    <form aria-label="form">
      <DateField label="Дата рождения" name="birthDate" {...props} />
    </form>,
  );
}

describe("DateField", () => {
  it("shows the date in words and posts it as YYYY-MM-DD", () => {
    form({ defaultValue: "2026-10-22" });
    expect(screen.getByRole("button", { name: /^Дата рождения/ }).textContent).toBe("22 октября 2026 г.");
    expect(new FormData(screen.getByRole<HTMLFormElement>("form")).get("birthDate")).toBe("2026-10-22");
  });

  it("picks a day decades back through the month and year lists", async () => {
    form({ max: "2026-10-22" });
    fireEvent.click(screen.getByRole("button", { name: /^Дата рождения/ }));
    const year = await screen.findByRole("combobox", { name: "Год" });
    expect(screen.queryByRole("option", { name: "2027" })).toBeNull();
    fireEvent.change(year, { target: { value: "1992" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Месяц" }), { target: { value: "05" } });
    fireEvent.click(screen.getByRole("button", { name: "14 мая 1992 г." }));

    await waitFor(() => expect(screen.getByRole("button", { name: /^Дата рождения/ }).textContent).toBe("14 мая 1992 г."));
    expect(new FormData(screen.getByRole<HTMLFormElement>("form")).get("birthDate")).toBe("1992-05-14");
  });

  it("opens an empty field on openOn instead of this month", async () => {
    form({ openOn: "1996-10-22" });
    fireEvent.click(screen.getByRole("button", { name: /^Дата рождения/ }));
    expect((await screen.findByRole<HTMLSelectElement>("combobox", { name: "Год" })).value).toBe("1996");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Месяц" }).value).toBe("10");
  });

  it("does not offer days after max", async () => {
    form({ defaultValue: "2026-10-22", max: "2026-10-22" });
    fireEvent.click(screen.getByRole("button", { name: /^Дата рождения/ }));
    expect((await screen.findByRole("button", { name: /^23 октября 2026/ })).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /^22 октября 2026/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("stops a form with an empty required date, in Russian", () => {
    form({ required: true });
    const valid = screen.getByRole<HTMLFormElement>("form").checkValidity();
    expect(valid).toBe(false);
    const hold = document.querySelector<HTMLInputElement>("input[required]");
    expect(hold?.validationMessage).toBe("Выбери дату");
  });
});
