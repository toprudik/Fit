// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import type { ClientBooking } from "@/lib/bookings/load";
import type { ClientTrainerMoney, PassView } from "@/lib/passes/load";
import { renderWithProviders } from "@/test/render";
import { ClientHomeView } from "./client-home";

const booking = {
  id: "b1",
  status: "confirmed",
  sessionStatus: "scheduled",
  kind: "personal",
  source: "client",
  startsAt: "2026-10-22T15:00:00Z",
  endsAt: "2026-10-22T16:00:00Z",
  mode: "offline",
  title: null,
  trainer: "Ольга",
  trainerUsername: null,
  trainerId: "t1",
  sessionId: "s1",
  locationId: null,
  cancelReason: null,
} as ClientBooking;

function pass(id: string, status: PassView["status"], remaining: number): PassView {
  return { id, title: "10 занятий", status, remaining, sessionsTotal: 10 } as PassView;
}

function trainer(passes: PassView[], debtSessions = 0): ClientTrainerMoney {
  return {
    coachingId: "c1",
    trainerName: "Ольга",
    timeZone: "Europe/Moscow",
    debt: { sessions: debtSessions, amounts: debtSessions ? { RUB: 2_000_00 } : {} },
    passes,
    paymentLinks: [],
  };
}

describe("ClientHomeView", () => {
  it("shows the next session, waiting requests, live passes and the debt", () => {
    const home = {
      timeZone: "Europe/Moscow",
      next: booking,
      requests: 1,
      money: [trainer([pass("p1", "active", 8), pass("p2", "expired", 0)], 1)],
    };
    renderWithProviders(<ClientHomeView t={ru} locale="ru" home={home} />);

    expect(screen.getByRole("link", { name: /Тренер Ольга/ }).getAttribute("href")).toBe("/client/bookings/b1");
    expect(screen.getByText(/18:00/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ждут ответа тренера/ }).getAttribute("href")).toBe("/client/sessions");
    expect(screen.getByRole("link", { name: /Осталось 8 из 10/ }).getAttribute("href")).toBe("/client/passes/p1");
    expect(screen.queryByRole("link", { name: /Осталось 0 из 10/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Долг/ }).getAttribute("href")).toBe("/client/passes");
    expect(screen.getByRole("link", { name: "Записаться" }).getAttribute("href")).toBe("/client/book");
  });

  it("offers to book when nothing is planned and leaves the passes out when there are none", () => {
    renderWithProviders(<ClientHomeView t={ru} locale="ru" home={{ timeZone: "Europe/Moscow", next: null, requests: 0, money: [] }} />);

    expect(screen.getByText("Ближайших занятий нет")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Записаться" }).getAttribute("href")).toBe("/client/book");
    expect(screen.queryByText("Абонементы")).toBeNull();
  });
});
