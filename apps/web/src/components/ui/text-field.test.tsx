// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextField } from "@/components/ui/text-field";
import { renderWithProviders } from "@/test/render";

describe("TextField", () => {
  it("names the input by its visible label and describes it with the hint", () => {
    renderWithProviders(<TextField label="Код приглашения" hint="12 букв и цифр" name="code" />);
    const input = screen.getByRole("textbox", { name: "Код приглашения" });
    expect(input.getAttribute("name")).toBe("code");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe("12 букв и цифр");
  });

  it("shows the error in place of the hint and marks the input invalid", () => {
    renderWithProviders(<TextField label="Сколько дней действует" hint="Подсказка" error="Введи число от 1 до 90" suffix="дн." />);
    const input = screen.getByRole("textbox", { name: "Сколько дней действует" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Введи число от 1 до 90");
    expect(screen.queryByText("Подсказка")).toBeNull();
    expect(screen.getByText("дн.")).toBeTruthy();
  });
});
