import type { Locator, Page } from "@playwright/test";
import { isPhone, SCHEMES, settle } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import type { Persona } from "./support/personas";
import { buildScene, mskDay, type Scene } from "./support/scene";

/*
 * Screenshots of the key screens with the populated scene, in both themes. The scene is made relative
 * to today and the server renders with the real clock, so everything that moves with the date (days,
 * times, relative words) is masked, along with avatars and codes; names are the fixtures' own.
 * Refresh after a deliberate UI change: scripts/e2e-scenarios.sh visual --update-snapshots
 */

type People = {
  client: Persona & { coachingId: string };
  trainer: Persona;
  admin: Persona;
  fresh: () => Promise<Persona>;
};

type Shot = {
  slug: string;
  role: "client" | "trainer" | "admin" | "fresh";
  path: (scene: Scene, people: People) => string;
  /** More to mask on this screen, such as counts that other tests running in parallel change. */
  mask?: (page: Page) => Locator[];
  /** Heading that says the screen has rendered. */
  heading: string | RegExp;
  /** Brings the screen into the captured state after load (open a sheet). Returns what to capture. */
  act?: (page: Page, testInfo: { phone: boolean }) => Promise<Locator | void>;
};

const SHOTS: Shot[] = [
  {
    slug: "client-home",
    role: "client",
    path: () => "/client",
    heading: "Главная",
  },
  {
    slug: "client-sessions",
    role: "client",
    path: () => "/client/sessions",
    heading: "Занятия",
  },
  {
    slug: "client-diary",
    role: "client",
    path: () => "/client/diary",
    heading: "Дневник",
  },
  {
    slug: "client-food-day",
    role: "client",
    path: () => "/client/diary/food",
    heading: "Питание",
  },
  {
    slug: "client-progress",
    role: "client",
    path: () => "/client/progress",
    heading: "Прогресс",
  },
  {
    slug: "client-trainers",
    role: "client",
    path: () => "/client/trainers",
    heading: "Тренеры",
  },
  {
    slug: "client-pass",
    role: "client",
    path: (s) => `/client/passes/${s.passId}`,
    heading: /Пакет 10 занятий|Абонемент/,
  },
  {
    slug: "client-booking-sheet",
    role: "client",
    path: () => "/client/book",
    heading: "Запись на занятие",
    act: async (page) => {
      const day = new Date(`${mskDay(3)}T12:00:00+03:00`);
      const label = new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Europe/Moscow",
        day: "numeric",
      }).format(day);
      await page
        .getByRole("button", { name: new RegExp(`\\b${label}\\b`) })
        .first()
        .click();
      await page.getByRole("button", { name: /16:00/ }).first().click();
      const sheet = page.getByRole("dialog");
      // The pass check runs after the sheet opens; capture its answer, not the spinner.
      await expect(sheet.getByText(/останется занятий/)).toBeVisible();
      return sheet;
    },
  },
  {
    slug: "trainer-today",
    role: "trainer",
    path: () => "/trainer",
    heading: "Сегодня",
  },
  {
    slug: "trainer-schedule",
    role: "trainer",
    path: () => "/trainer/schedule",
    heading: "Расписание",
  },
  {
    slug: "trainer-clients",
    role: "trainer",
    path: () => "/trainer/clients",
    heading: "Клиенты",
  },
  {
    slug: "trainer-pair-card",
    role: "trainer",
    path: (s) => `/trainer/clients/${s.coachingId}`,
    heading: /Анна/,
  },
  {
    slug: "trainer-session",
    role: "trainer",
    path: (s) => `/trainer/sessions/${s.sessionIds[0]}`,
    heading: "Занятие",
  },
  {
    slug: "trainer-money",
    role: "trainer",
    path: () => "/trainer/money",
    heading: "Деньги",
  },
  {
    slug: "trainer-more",
    role: "trainer",
    path: () => "/trainer/more",
    heading: "Ещё",
  },
  {
    slug: "trainer-profile-sheet",
    role: "trainer",
    path: () => "/trainer",
    heading: "Сегодня",
    act: async (page) => {
      // The avatar in the phone header is «Профиль»; the side menu on a computer names the account.
      await page
        .getByRole("button", { name: /^(Профиль|Иван Тренеров)$/ })
        .filter({ visible: true })
        .first()
        .click();
      const sheet = page.getByRole("dialog", { name: "Профиль" });
      await expect(sheet).toBeVisible();
      return sheet;
    },
  },
  {
    slug: "settings",
    role: "trainer",
    path: () => "/settings",
    heading: "Настройки",
  },
  // The whole local database counts here, and other tests add to it.
  {
    slug: "admin-overview",
    role: "admin",
    path: () => "/admin",
    heading: "Обзор беты",
    mask: (page) => [page.getByText(/^\d+$/)],
  },
  {
    slug: "admin-users",
    role: "admin",
    path: (_, people) => `/admin/users?q=${people.client.telegramId}`,
    heading: "Пользователи",
    mask: (page) => [page.getByText(/\d{6,}/), page.getByRole("searchbox")],
  },
  {
    slug: "onboarding-consent",
    role: "fresh",
    path: () => "/onboarding/consent?next=%2Fclient",
    heading: "Закрытая бета DaFit",
  },
];

const MONTHS = "янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек";
const WEEKDAYS = "пн|вт|ср|чт|пт|сб|вс|понедельник|вторник|сред[аы]|четверг|пятниц[аы]|суббот[аы]|воскресенье";

/** Everything that changes from run to run or day to day. */
function masks(page: Page): Locator[] {
  // The screen and any open sheet; the tab bar and side menu (whose «Сегодня» is a label, not a date) stay visible.
  const content = page.locator("main, [role=dialog]");
  return [
    content.locator("time"),
    content.getByText(/\d{1,2}:\d{2}/),
    content.getByText(new RegExp(`\\d{1,2}\\s(${MONTHS})`, "i")),
    content.getByText(new RegExp(`(^|[\\s,(])(${WEEKDAYS})([\\s,.)]|$)`, "i")),
    content.getByText(/\b20\d\d\b/),
    content.getByText(/(сегодня|завтра|вчера|послезавтра|через \d+|\d+ (дн|день|недел))/i),
    page.locator("[data-slot=avatar], img, canvas, svg[data-qr]"),
  ];
}

for (const scheme of SCHEMES) {
  for (const shot of SHOTS) {
    test(`@visual ${shot.slug} in the ${scheme} theme`, async ({ trainer, client, admin, persona, baseURL }, testInfo) => {
      const scene = await buildScene(trainer, client, admin);
      const people: People = {
        client,
        trainer,
        admin,
        fresh: () => persona({ firstName: "Мария", lastName: "Новикова", consent: false }),
      };
      const who = shot.role === "fresh" ? await people.fresh() : people[shot.role];
      const { page, context } = who;
      await context.addCookies([{ name: "dafit-theme", value: scheme, url: baseURL }]);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });

      await page.goto(shot.path(scene, people), { waitUntil: "networkidle" });
      await expect(page.getByRole("heading", { level: 1, name: shot.heading }).first()).toBeVisible();
      await settle(page);
      const target = (await shot.act?.(page, { phone: isPhone(testInfo) })) ?? undefined;
      await settle(page);

      const options = {
        mask: [...masks(page), ...(shot.mask?.(page) ?? [])],
        fullPage: !target,
      };
      if (target) await expect(target).toHaveScreenshot(`${shot.slug}-${scheme}.png`, options);
      else await expect(page).toHaveScreenshot(`${shot.slug}-${scheme}.png`, options);
    });
  }
}
