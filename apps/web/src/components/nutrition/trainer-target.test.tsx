// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setPairTarget } from "@/lib/nutrition/actions";
import { renderWithProviders } from "@/test/render";
import { TrainerTargetForm } from "./trainer-target";

vi.mock("@/lib/nutrition/actions", () => ({ setPairTarget: vi.fn(), clearPairTarget: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PAIR = "00000000-0000-4000-8000-000000000010";
const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (name: string, value: string) => fireEvent.change(input(name), { target: { value } });

describe("TrainerTargetForm: macros in %", () => {
  beforeEach(() => vi.mocked(setPairTarget).mockReset().mockResolvedValue({ ok: true }));

  it("carries grams over to shares of the kcal and saves the grams they give", async () => {
    renderWithProviders(<TrainerTargetForm coachingId={PAIR} current={{ kcal: 1800, proteinG: 135, fatG: 60, carbsG: 180 }} goals={null} sex="female" />);
    fireEvent.click(screen.getByRole("button", { name: "Изменить норму" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Проценты" }));
    expect([input("Белки").value, input("Жиры").value, input("Углеводы").value]).toEqual(["30", "30", "40"]);

    type("Калории", "2000");
    type("Белки", "25");
    type("Жиры", "30");
    type("Углеводы", "45");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(setPairTarget).toHaveBeenCalledWith({ coachingId: PAIR, kcal: 2000, proteinG: 125, fatG: 67, carbsG: 225, waterMl: null, steps: null, confirmLow: false }),
    );
  });

  it("refuses shares adding up to more than 100%", async () => {
    renderWithProviders(<TrainerTargetForm coachingId={PAIR} current={null} goals={null} sex={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Задать норму" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Проценты" }));
    type("Калории", "2000");
    type("Белки", "40");
    type("Жиры", "40");
    type("Углеводы", "40");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Вместе больше 100%")).toBeTruthy();
    expect(setPairTarget).not.toHaveBeenCalled();
  });
});

describe("TrainerTargetForm: water and steps goals", () => {
  beforeEach(() => vi.mocked(setPairTarget).mockReset().mockResolvedValue({ ok: true }));

  it("keeps the trainer's goals and saves new ones with the target", async () => {
    renderWithProviders(
      <TrainerTargetForm coachingId={PAIR} current={{ kcal: 2000, proteinG: null, fatG: null, carbsG: null }} goals={{ waterMl: 2500, steps: null }} sex={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Изменить норму" }));
    expect([input("Вода в день").value, input("Шаги в день").value]).toEqual(["2500", ""]);
    type("Шаги в день", "12000");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(setPairTarget).toHaveBeenCalledWith({
        coachingId: PAIR,
        kcal: 2000,
        proteinG: null,
        fatG: null,
        carbsG: null,
        waterMl: 2500,
        steps: 12000,
        confirmLow: false,
      }),
    );
  });

  it("refuses steps over 100 000", async () => {
    renderWithProviders(<TrainerTargetForm coachingId={PAIR} current={null} goals={null} sex={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Задать норму" }));
    type("Калории", "2000");
    type("Шаги в день", "100001");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Целое число до 100 000")).toBeTruthy();
    expect(setPairTarget).not.toHaveBeenCalled();
  });
});
