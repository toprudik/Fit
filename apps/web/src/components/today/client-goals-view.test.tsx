// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { renderWithProviders } from "@/test/render";
import { ClientGoalsView, type ClientGoals } from "./client-goals-view";

vi.mock("./quick-weight", () => ({ QuickWeight: ({ today }: { today: string }) => <p>вес за {today}</p> }));

const goals: ClientGoals = {
  today: "2026-10-18",
  food: { eaten: 1250.4, target: 2000 },
  steps: { done: 4300, goal: 8000 },
  homework: 2,
  streaks: { workouts: 3, weekGoal: 3, weekDone: 1, diary: 5, steps: null },
};

function view(over: Partial<ClientGoals> = {}) {
  return renderWithProviders(<ClientGoalsView t={ru} locale="ru" goals={{ ...goals, ...over }} />);
}

describe("ClientGoalsView", () => {
  it("shows calories against the norm, steps against the goal and the due homework", () => {
    view();
    expect(screen.getByRole("link", { name: /Питание/ }).getAttribute("href")).toBe("/client/diary/food");
    expect(screen.getByText(/^1\s250 из 2\s000 ккал$/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Шаги/ }).getAttribute("href")).toBe("/client/diary/activity");
    expect(screen.getByRole("link", { name: new RegExp(ru.homework.open) }).getAttribute("href")).toBe("/client/sessions/homework");
    expect(screen.getByText("вес за 2026-10-18")).toBeTruthy();
    expect(screen.getByRole("list", { name: ru.gamification.streaks.header })).toBeTruthy();
  });

  it("shows only the calories eaten without a norm, and no homework row or streaks when there are none", () => {
    view({ food: { eaten: 900, target: null }, homework: null, streaks: { workouts: 0, weekGoal: 3, weekDone: 0, diary: 0, steps: null } });
    expect(screen.getByText("900 ккал")).toBeTruthy();
    expect(screen.queryByRole("link", { name: new RegExp(ru.homework.open) })).toBeNull();
    expect(screen.queryByRole("list", { name: ru.gamification.streaks.header })).toBeNull();
  });
});
