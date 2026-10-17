// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNutritionGoal } from "@/lib/nutrition/actions";
import { renderWithProviders } from "@/test/render";
import { GoalStep } from "./goal-step";

vi.mock("@/lib/nutrition/actions", () => ({ setNutritionGoal: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("GoalStep", () => {
  beforeEach(() => vi.mocked(setNutritionGoal).mockReset());

  it("can be skipped until a goal is picked, then finishes on the trainer's page", async () => {
    vi.mocked(setNutritionGoal).mockResolvedValue({ ok: true });
    renderWithProviders(<GoalStep initial={null} doneHref="/client/trainers/pair" />);
    expect(screen.getByRole("link", { name: "Пропустить" }).getAttribute("href")).toBe("/client/trainers/pair");
    expect(screen.queryByRole("link", { name: "Готово" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Набрать массу" }));
    expect(setNutritionGoal).toHaveBeenCalledWith("gain");
    expect((await screen.findByRole("link", { name: "Готово" })).getAttribute("href")).toBe("/client/trainers/pair");
    expect(screen.queryByRole("link", { name: "Пропустить" })).toBeNull();
  });

  it("shows a goal already chosen", () => {
    renderWithProviders(<GoalStep initial="lose" doneHref="/client/trainers/pair" />);
    expect((screen.getByRole("radio", { name: "Снизить вес" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("link", { name: "Готово" })).toBeTruthy();
  });
});
