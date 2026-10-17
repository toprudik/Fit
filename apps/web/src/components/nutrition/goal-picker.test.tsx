// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNutritionGoal } from "@/lib/nutrition/actions";
import type { Goal } from "@/lib/nutrition/target";
import { renderWithProviders } from "@/test/render";
import { GoalPicker } from "./goal-picker";

vi.mock("@/lib/nutrition/actions", () => ({ setNutritionGoal: vi.fn() }));
vi.mock("@/components/ui/sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function Harness({ initial, activeSource, trainerName = null }: { initial: Goal | null; activeSource: "calculator" | "trainer" | null; trainerName?: string | null }) {
  const [goal, setGoal] = useState<Goal | null>(initial);
  return <GoalPicker goal={goal} onChange={setGoal} activeSource={activeSource} trainerName={trainerName} />;
}

describe("GoalPicker", () => {
  beforeEach(() => vi.mocked(setNutritionGoal).mockReset());

  it("saves a pick at once and asks to recalculate a calculator target", async () => {
    vi.mocked(setNutritionGoal).mockResolvedValue({ ok: true });
    renderWithProviders(<Harness initial="maintain" activeSource="calculator" />);
    fireEvent.click(screen.getByRole("radio", { name: "Снизить вес" }));
    expect(setNutritionGoal).toHaveBeenCalledWith("lose");
    expect((await screen.findByRole("status")).textContent).toContain("Пересчитай норму ниже");
    expect((screen.getByRole("radio", { name: "Снизить вес" }) as HTMLInputElement).checked).toBe(true);
  });

  it("says a trainer's target stays", async () => {
    vi.mocked(setNutritionGoal).mockResolvedValue({ ok: true });
    renderWithProviders(<Harness initial={null} activeSource="trainer" trainerName="Анна" />);
    fireEvent.click(screen.getByRole("radio", { name: "Набрать массу" }));
    expect((await screen.findByRole("status")).textContent).toContain("Норму задал тренер Анна, она не изменится.");
  });

  it("puts the previous goal back when saving fails", async () => {
    vi.mocked(setNutritionGoal).mockResolvedValue({ ok: false, reason: "failed" });
    renderWithProviders(<Harness initial="maintain" activeSource={null} />);
    fireEvent.click(screen.getByRole("radio", { name: "Набрать массу" }));
    await waitFor(() => expect((screen.getByRole("radio", { name: "Держать вес" }) as HTMLInputElement).checked).toBe(true));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
