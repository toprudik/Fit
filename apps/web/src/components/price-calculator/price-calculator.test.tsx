// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { renderWithProviders } from "@/test/render";
import { PriceCalculator } from "./price-calculator";

const copy = ru.priceCalculator;
const field = (label: RegExp | string) => screen.getByLabelText(label) as HTMLInputElement;

describe("PriceCalculator", () => {
  it("starts in roubles with the template prices from a 2 000 ₽ drop-in", () => {
    renderWithProviders(<PriceCalculator ctaHref="/for-trainers?src=price_calc#waitlist" />);
    expect((screen.getByRole("radio", { name: /RUB/ }) as HTMLInputElement).checked).toBe(true);
    expect(field(copy.dropIn).value).toBe("2000");
    expect(field(/Пакет на 5/).value).toBe("9000");
    expect(field(/Пакет на 10/).value).toBe("16000");
    expect(field(/Пакет на 20/).value).toBe("30000");
    expect(screen.getByText(copy.best)).toBeTruthy();
    expect(screen.getByRole("link", { name: copy.cta }).getAttribute("href")).toBe("/for-trainers?src=price_calc#waitlist");
  });

  it("follows the drop-in until a pack is typed, then keeps the typed price", () => {
    renderWithProviders(<PriceCalculator ctaHref="/for-trainers#waitlist" />);
    fireEvent.change(field(/Пакет на 5/), { target: { value: "9500" } });
    fireEvent.change(field(copy.dropIn), { target: { value: "3000" } });
    expect(field(/Пакет на 5/).value).toBe("9500");
    expect(field(/Пакет на 10/).value).toBe("24000");
  });

  it("says what is wrong with a price that is not a number", () => {
    renderWithProviders(<PriceCalculator ctaHref="/for-trainers#waitlist" />);
    fireEvent.change(field(copy.dropIn), { target: { value: "дорого" } });
    expect(screen.getByText(copy.dropInError)).toBeTruthy();
    expect(screen.getByText(copy.gridEmpty)).toBeTruthy();
  });

  it("starts over in another currency", () => {
    renderWithProviders(<PriceCalculator ctaHref="/for-trainers#waitlist" />);
    fireEvent.click(screen.getByRole("radio", { name: /USD/ }));
    expect(field(copy.dropIn).value).toBe("40");
    expect(field(/Пакет на 10/).value).toBe("320");
  });
});
