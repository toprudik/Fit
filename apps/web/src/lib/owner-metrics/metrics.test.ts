import { describe, expect, it } from "vitest";
import { dictionaries } from "@/i18n/dictionaries";
import {
  SUCCESS_GOALS,
  growth,
  growthText,
  lastFullWeeks,
  moneyCell,
  channelName,
  ownerCsv,
  ownerWeeks,
  retentionShares,
  successSignal,
  type OwnerSummary,
  type OwnerWeek,
} from "./metrics";

function week(week_start: string, values: Partial<OwnerWeek> = {}): OwnerWeek {
  return {
    week_start,
    new_users: 0,
    new_trainers: 0,
    new_pairs: 0,
    active_users: 0,
    active_trainers: 0,
    active_clients: 0,
    held_sessions: 0,
    attended: 0,
    bookings: 0,
    passes_sold: 0,
    turnover: {},
    trainer_invites_created: 0,
    trainer_invites_redeemed: 0,
    referrals: 0,
    ...values,
  };
}

const summary: OwnerSummary = {
  users: 120,
  trainers: 9,
  trainers_verified: 6,
  clients: 80,
  cards: 4,
  pairs: 85,
  dau: 30,
  wau: 70,
  mau: 100,
  trainers_active_7: 8,
  trainers_active_30: 9,
  clients_active_7: 50,
  clients_active_30: 75,
  held_sessions: 300,
  attended: 280,
  bookings: 350,
  passes_sold: 40,
  turnover: { RUB: 12_345_000 },
  turnover_30: { RUB: 2_000_050 },
  trainer_invites_created: 12,
  trainer_invites_redeemed: 9,
  trainer_referrals: 2,
  client_referrals: 5,
  client_referrals_qualified: 3,
  joins_by_source: { client_invite: 60, trainer_code: 20 },
};

describe("owner metrics", () => {
  it("reads the weeks from the address, 12 by default", () => {
    expect(ownerWeeks("26")).toBe(26);
    expect(ownerWeeks("5")).toBe(12);
    expect(ownerWeeks(undefined)).toBe(12);
  });

  it("compares a week with the one before", () => {
    expect(growth(12, 10)).toBe(20);
    expect(growth(5, 10)).toBe(-50);
    expect(growth(3, 0)).toBeNull();
    expect([growthText(20), growthText(-50), growthText(0), growthText(null)]).toEqual(["+20%", "−50%", "0%", ""]);
  });

  it("skips the running week for week to week", () => {
    const weeks = [week("2026-09-28", { new_users: 4 }), week("2026-10-05", { new_users: 6 }), week("2026-10-12", { new_users: 1 })];
    expect(lastFullWeeks(weeks)).toEqual({ current: weeks[1], previous: weeks[0] });
    expect(lastFullWeeks(weeks.slice(1))).toBeNull();
  });

  it("turns cohort counts into whole percents", () => {
    expect(retentionShares({ size: 8, retained: [8, 4, 1] })).toEqual([100, 50, 13]);
    expect(retentionShares({ size: 0, retained: [0] })).toEqual([null]);
  });

  it("writes money per currency in major units", () => {
    expect(moneyCell({ RUB: 400_000, EUR: 1250 }, "ru")).toBe("12,50 EUR; 4000,00 RUB");
    expect(moneyCell({}, "en")).toBe("0");
  });

  it("measures the beta goals against their targets", () => {
    expect(successSignal(3, 10, SUCCESS_GOALS.streak)).toEqual({ share: 30, reached: true });
    expect(successSignal(2, 10, SUCCESS_GOALS.streak)).toEqual({ share: 20, reached: false });
    expect(successSignal(3, 5, SUCCESS_GOALS.offers)).toEqual({ share: 60, reached: true });
    expect(successSignal(0, 0, SUCCESS_GOALS.offers)).toEqual({ share: null, reached: false });
  });

  it("puts the summary, the beta goals, the weeks and the cohorts in one CSV", () => {
    const copy = dictionaries.ru.ownerStats;
    const csv = ownerCsv(
      {
        summary,
        success: { clients: 10, clients_with_streak: 4, trainers: 5, trainers_offer_live: 2, trainers_offer_ever: 3 },
        channels: [
          { source: "vk", campaign: "autumn", users: 7, trainers: 2, clients: 4 },
          { source: "promo-1", campaign: null, users: 3, trainers: 0, clients: 3 },
          { source: null, campaign: null, users: 110, trainers: 18, clients: 50 },
        ],
        weekly: [week("2026-10-05", { new_users: 6, turnover: { RUB: 100_000 } })],
        cohorts: [{ cohort_week: "2026-10-05", size: 4, retained: [4, 2] }],
      },
      { ...copy.csv, sources: copy.sources, channelNames: copy.channels.names, noChannel: copy.channels.none },
      "ru",
    );
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("Сводка");
    expect(lines).toContain("Аккаунтов;120");
    expect(lines).toContain("Оборот за всё время;123450,00 RUB");
    expect(lines).toContain('Как клиенты пришли к тренерам;"Ссылка или QR тренера: 60; Код тренера: 20"');
    expect(lines).toContain("Цели беты");
    expect(lines).toContain("Клиентов с недельной серией;4");
    expect(lines).toContain("Доля клиентов с недельной серией;40%");
    expect(lines).toContain("Доля тренеров с действующей акцией;40%");
    expect(lines).toContain("Канал;Кампания;Аккаунтов;Тренеров;Клиентов с тренером");
    expect(lines).toContain("ВКонтакте;autumn;7;2;4");
    expect(lines).toContain("promo-1;;3;0;3");
    expect(lines).toContain("Без метки;;110;18;50");
    expect(lines.find((line) => line.startsWith("2026-10-05;6;"))).toContain("1000,00 RUB");
    expect(lines).toContain("Неделя;Людей;Неделя 0;Неделя 1");
    expect(lines).toContain("2026-10-05;4;100%;50%");
  });
});

describe("channelName", () => {
  const names = { vk: "ВКонтакте" };
  it("names a known channel, keeps an unknown label and adds the campaign", () => {
    expect(channelName({ source: "vk", campaign: null }, names, "Без метки")).toBe("ВКонтакте");
    expect(channelName({ source: "vk", campaign: "autumn" }, names, "Без метки")).toBe("ВКонтакте · autumn");
    expect(channelName({ source: "promo-1", campaign: null }, names, "Без метки")).toBe("promo-1");
    expect(channelName({ source: null, campaign: null }, names, "Без метки")).toBe("Без метки");
  });
});
