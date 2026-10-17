// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { PriceSimulator } from "./price-simulator";

const base = [{ currency: "RUB", monthlyMinor: 100_000_00 }];
const packages = [
  { id: "p1", title: "Разовое", priceMinor: 2_000_00, currency: "RUB", sold: 3 },
  { id: "p10", title: "10 занятий", priceMinor: 18_000_00, currency: "RUB", sold: 1 },
];

describe("PriceSimulator", () => {
  it("raises by a percent until the trainer switches to new prices", () => {
    renderWithProviders(<PriceSimulator base={base} packages={packages} />);
    expect(screen.getByLabelText("Повышение цен, %")).toBeTruthy();
    expect(screen.queryByLabelText("Разовое")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Новыми ценами" }));
    expect(screen.queryByLabelText("Повышение цен, %")).toBeNull();
    // Same prices: no change yet.
    expect(screen.getByText("Средняя цена изменится на 0%")).toBeTruthy();

    // 3 × 2 000 + 18 000 = 24 000 → 3 × 2 400 + 18 000 = 25 200: +5 %.
    fireEvent.change(screen.getByLabelText("Разовое"), { target: { value: "2400" } });
    expect(screen.getByText("Средняя цена изменится на +5%")).toBeTruthy();
    expect(screen.getByText(/Выручка не изменится, если уйдёт 4,8% клиентов/)).toBeTruthy();
  });

  it("asks for a number when a new price is not one", () => {
    renderWithProviders(<PriceSimulator base={base} packages={packages} />);
    fireEvent.click(screen.getByRole("radio", { name: "Новыми ценами" }));
    fireEvent.change(screen.getByLabelText("10 занятий"), { target: { value: "дорого" } });
    expect(screen.getByText("Введите цену числом, например 2500")).toBeTruthy();
  });

  it("offers only the percent without packages in the earning currency", () => {
    renderWithProviders(<PriceSimulator base={base} packages={[{ ...packages[0], currency: "USD" }]} />);
    expect(screen.queryByRole("radio", { name: "Новыми ценами" })).toBeNull();
    expect(screen.getByLabelText("Повышение цен, %")).toBeTruthy();
  });
});
