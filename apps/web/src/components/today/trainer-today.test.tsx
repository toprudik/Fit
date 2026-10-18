// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import type { SessionRow } from "@/lib/schedule/week";
import type { TodaySession, TrainerToday } from "@/lib/today/trainer-today";
import { renderWithProviders } from "@/test/render";
import { TrainerTodayView } from "./trainer-today";

function session(id: string, kind: SessionRow["kind"], startMin: number, extra: Partial<SessionRow> = {}, taken = 0): TodaySession {
  const row: SessionRow = { id, kind, title: null, starts_at: "", ends_at: "", mode: "offline", capacity: 8, status: "scheduled", ...extra };
  return { type: "session", id, startMin, endMin: startMin + 60, session: row, taken };
}

const day = "2026-10-22";

describe("TrainerTodayView", () => {
  it("lists today's sessions with the client or the group and what waits for the trainer", () => {
    const today: TrainerToday = {
      day,
      sessions: [session("s1", "personal", 9 * 60), session("s2", "group", 18 * 60 + 30, { mode: "online" }, 5)],
      names: new Map([["s1", "Анна"]]),
      requests: 2,
    };
    renderWithProviders(<TrainerTodayView t={ru} today={today} attention={{ debts: 0, ending: 1 }} />);

    expect(screen.getByRole("link", { name: /Анна/ }).getAttribute("href")).toBe("/trainer/sessions/s1");
    expect(screen.getByText("09:00–10:00")).toBeTruthy();
    expect(screen.getByText("18:30–19:30, онлайн, 5 из 8")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Запросы на запись/ }).getAttribute("href")).toBe("/trainer/requests");
    expect(screen.getByRole("link", { name: /Заканчиваются абонементы/ }).getAttribute("href")).toBe("/trainer/money");
    expect(screen.queryByText("Долги клиентов")).toBeNull();
  });

  it("points to the schedule on a day without sessions and hides an empty attention list", () => {
    const today: TrainerToday = { day, sessions: [], names: new Map(), requests: 0 };
    renderWithProviders(<TrainerTodayView t={ru} today={today} attention={{ debts: 0, ending: 0 }} />);

    expect(screen.getByText("Сегодня занятий нет")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Открыть расписание" }).getAttribute("href")).toBe("/trainer/schedule");
    expect(screen.queryByText("Требует внимания")).toBeNull();
  });
});
