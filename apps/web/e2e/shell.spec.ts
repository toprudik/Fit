import { expect, test, type Page } from "@playwright/test";
import {
  collectErrors,
  expectAccessible,
  expectNoSheetLeft,
  expectOpaque,
  expectTabs,
  isPhone,
  NAV_LABEL,
  recordAnimations,
  SCHEMES,
  screenshotPath,
  screenSlideStart,
  settle,
  TABS,
  takeAnimations,
  type Locale,
  type Zone,
} from "./support";

/*
 * The app shell from docs/architecture/screens.md §1–2 in both projects (phone, desktop) and both
 * themes: every screen renders, is accessible and gets a screenshot for design review.
 */

type Screen = {
  slug: string;
  path: string;
  /** The h1 and, unless `documentTitle` is false, the "<title> | DaFit" tab title. */
  title: string;
  documentTitle?: false;
  status?: number;
};

const SCREENS: readonly Screen[] = [
  { slug: "trainer-today", path: "/trainer", title: "Сегодня" },
  { slug: "trainer-schedule", path: "/trainer/schedule", title: "Расписание" },
  { slug: "trainer-week-template", path: "/trainer/schedule/template", title: "Шаблон недели" },
  { slug: "trainer-slots", path: "/trainer/schedule/slots", title: "Слоты" },
  { slug: "trainer-new-session", path: "/trainer/sessions/new", title: "Новое занятие" },
  { slug: "trainer-session", path: "/trainer/sessions/0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f", title: "Занятие" },
  { slug: "trainer-requests", path: "/trainer/requests", title: "Запросы на запись" },
  { slug: "trainer-request", path: "/trainer/requests/0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f", title: "Запрос на запись" },
  { slug: "trainer-clients", path: "/trainer/clients", title: "Клиенты" },
  { slug: "trainer-new-card", path: "/trainer/clients/new", title: "Добавить клиента вручную" },
  { slug: "trainer-money", path: "/trainer/money", title: "Деньги" },
  { slug: "trainer-more", path: "/trainer/more", title: "Ещё" },
  { slug: "trainer-exercises", path: "/trainer/exercises", title: "Упражнения" },
  { slug: "trainer-new-exercise", path: "/trainer/exercises/new", title: "Своё упражнение" },
  { slug: "trainer-templates", path: "/trainer/templates", title: "Шаблоны тренировок" },
  { slug: "trainer-new-template", path: "/trainer/templates/new", title: "Новый шаблон" },
  { slug: "trainer-packages", path: "/trainer/money/packages", title: "Пакеты и цены" },
  { slug: "client-passes", path: "/client/passes", title: "Абонементы" },
  { slug: "client-home", path: "/client", title: "Главная" },
  { slug: "client-sessions", path: "/client/sessions", title: "Занятия" },
  { slug: "client-book", path: "/client/book", title: "Запись на занятие" },
  { slug: "client-booking", path: "/client/bookings/0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f", title: "Запись" },
  { slug: "client-diary", path: "/client/diary", title: "Дневник" },
  { slug: "client-new-workout", path: "/client/diary/workouts/new", title: "Новая тренировка" },
  { slug: "client-progress", path: "/client/progress", title: "Прогресс" },
  { slug: "client-records", path: "/client/progress/records", title: "Рекорды" },
  { slug: "client-trainers", path: "/client/trainers", title: "Тренеры" },
  { slug: "settings", path: "/settings", title: "Настройки" },
  { slug: "settings-plan", path: "/settings/plan", title: "Мой тариф" },
  { slug: "settings-notifications", path: "/settings/notifications", title: "Уведомления" },
  { slug: "settings-calendar", path: "/settings/calendar", title: "Календарь" },
  { slug: "settings-licenses", path: "/settings/licenses", title: "Лицензии" },
  { slug: "profile", path: "/profile", title: "Профиль" },
  { slug: "login", path: "/login", title: "Вход" },
  { slug: "trainer-invite", path: "/onboarding/trainer?code=ABCD-EFGH-JKLM", title: "Инвайт тренера" },
  { slug: "beta-terms", path: "/onboarding/consent?next=%2Fclient", title: "Закрытая бета DaFit" },
  { slug: "onboarding-preferences", path: "/onboarding/preferences?next=%2Fclient", title: "Язык и тема" },
  { slug: "trainer-wizard", path: "/onboarding/trainer/format", title: "Чем ты занимаешься", documentTitle: false },
  { slug: "trainer-wizard-prices", path: "/onboarding/trainer/prices", title: "Ценовая сетка", documentTitle: false },
  { slug: "trainer-links", path: "/trainer/links", title: "QR и ссылка" },
  { slug: "join", path: "/join?code=abc-def", title: "Код тренера" },
  // A malformed token is answered without the database: the "link no longer works" state.
  { slug: "client-link-invalid", path: "/i/not-a-token", title: "Приглашение тренера" },
  // A malformed token is answered without the database: the "link doesn't work" state.
  { slug: "trial-link-invalid", path: "/trial/not-a-token", title: "Пробное занятие" },
  // A malformed address is answered without the database: the "trainer unavailable" state (Q60).
  { slug: "showcase-unavailable", path: "/trainers/Not_A_Slug", title: "Тренер недоступен", documentTitle: false },
  { slug: "trainer-showcase", path: "/trainer/showcase", title: "Витрина" },
  // Signed out, the intake asks to sign in and come back.
  { slug: "client-intake-signed-out", path: "/client/trainers/00000000-0000-4000-8000-000000000000/intake", title: "Анкета" },
  // Signed out, "Что видит тренер" asks to sign in and come back.
  { slug: "client-sharing-signed-out", path: "/client/trainers/00000000-0000-4000-8000-000000000000/sharing", title: "Что видит тренер" },
  { slug: "not-found", path: "/no-such-page", title: "Такой страницы нет", documentTitle: false, status: 404 },
  // ADM-12: the admin section is a 404 for everyone but admins, signed out included.
  { slug: "admin-denied", path: "/admin/invites", title: "Такой страницы нет", documentTitle: false, status: 404 },
  { slug: "admin-verification-denied", path: "/admin/verification", title: "Такой страницы нет", documentTitle: false, status: 404 },
  { slug: "admin-overview-denied", path: "/admin", title: "Такой страницы нет", documentTitle: false, status: 404 },
  { slug: "admin-users-denied", path: "/admin/users", title: "Такой страницы нет", documentTitle: false, status: 404 },
  { slug: "admin-audit-denied", path: "/admin/audit", title: "Такой страницы нет", documentTitle: false, status: 404 },
  { slug: "admin-plans-denied", path: "/admin/plans", title: "Такой страницы нет", documentTitle: false, status: 404 },
];

const html = (page: Page) => page.locator("html");

/** The screen's own title. Not-found has no h1 (its title sits in an empty state), so any level counts there. */
function screenTitle(page: Page, screen: Screen) {
  return page.getByRole("heading", { name: screen.title, exact: true, level: screen.status === 404 ? undefined : 1 }).first();
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const screen of SCREENS) {
      test(`${screen.path} renders, passes axe and is captured`, async ({ page }, testInfo) => {
        const errors = collectErrors(page, screen.status === 404 ? [/Failed to load resource.*404/] : []);
        const response = await page.goto(screen.path, { waitUntil: "networkidle" });

        expect(response?.status()).toBe(screen.status ?? 200);
        await expect(html(page)).toHaveAttribute("lang", "ru");
        await expect(html(page)).toHaveAttribute("data-theme", scheme);
        await expect(screenTitle(page, screen)).toBeVisible();
        if (screen.documentTitle !== false) await expect(page).toHaveTitle(`${screen.title} | DaFit`);

        await settle(page);
        await expectAccessible(page);
        await page.screenshot({ path: screenshotPath(testInfo, scheme, screen.slug), fullPage: true });
        expect(errors()).toEqual([]);
      });
    }

    // The phone opens the profile from the avatar in the header, the desktop from the side menu.
    test("the profile sheet opened from the avatar passes axe", async ({ page }, testInfo) => {
      await page.goto("/trainer", { waitUntil: "networkidle" });

      await page.getByRole("button", { name: "Профиль", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Профиль" });
      await expect(sheet).toBeVisible();
      // Signed out there is no trainer profile, so no zone switch (PAIR-3).
      await expect(sheet.getByRole("radiogroup", { name: "Зона" })).toHaveCount(0);
      await expect(sheet.getByRole("link", { name: "Настройки" })).toBeVisible();

      await settle(page);
      await expectAccessible(page);
      await page.screenshot({ path: screenshotPath(testInfo, scheme, "profile-sheet"), fullPage: true });

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });
  });
}

// A malformed feed token is refused before the database, like a reissued one (CAL-3).
test("a calendar feed with a malformed token is a 404", async ({ request }) => {
  const response = await request.get("/api/calendar/not-a-token.ics");
  expect(response.status()).toBe(404);
});

test.describe("navigation", () => {
  test("the trainer zone has Сегодня, Расписание, Клиенты, Деньги, Ещё", async ({ page }, testInfo) => {
    await page.goto("/trainer");
    await expectTabs(page, testInfo, "ru", "trainer", "Сегодня");

    await page.goto("/trainer/clients");
    await expectTabs(page, testInfo, "ru", "trainer", "Клиенты");
  });

  test("the client zone has Главная, Занятия, Дневник, Прогресс, Тренеры", async ({ page }, testInfo) => {
    await page.goto("/client");
    await expectTabs(page, testInfo, "ru", "client", "Главная");

    await page.goto("/client/progress");
    await expectTabs(page, testInfo, "ru", "client", "Прогресс");
  });

  test("tapping a tab opens its screen", async ({ page }, testInfo) => {
    await page.goto("/trainer");
    await page.getByRole("link", { name: "Деньги", exact: true }).click();

    await expect(page).toHaveURL(/\/trainer\/money$/);
    await expect(page.getByRole("heading", { level: 1, name: "Деньги" }).first()).toBeVisible();
    await expectTabs(page, testInfo, "ru", "trainer", "Деньги");
  });

  test("/ opens the client zone first, then the last zone visited", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/client$/);

    await page.goto("/trainer");
    await page.goto("/");
    await expect(page).toHaveURL(/\/trainer$/);
  });

  test("URLs never show the locale", async ({ page }) => {
    await page.goto("/client/diary");
    await expect(page).toHaveURL(/\/client\/diary$/);
  });
});

test.describe("trainer invite", () => {
  test("signed out, the beta terms send to sign-in and back with the next screen", async ({ page }) => {
    await page.goto("/onboarding/consent?next=%2Fonboarding%2Ftrainer%3Fcode%3DABCD");
    await expect(page.getByRole("link", { name: "Войти" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/onboarding/consent?next=${encodeURIComponent("/onboarding/trainer?code=ABCD")}`)}`,
    );
  });

  test("the preferences step goes on to the next screen", async ({ page }) => {
    await page.goto("/onboarding/preferences?next=%2Fclient%2Fsessions");
    await page.getByRole("link", { name: "Далее" }).click();
    await expect(page).toHaveURL(/\/client\/sessions$/);
  });

  test("signed out, the invite screen sends to sign-in and back with the code", async ({ page }) => {
    await page.goto("/onboarding/trainer?code=abcd-efgh-jklm");
    await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/onboarding/trainer?code=ABCDEFGHJKLM")}`,
    );
  });

  test("signed out, a wizard step sends to sign-in and back to the same step", async ({ page }) => {
    await page.goto("/onboarding/trainer/region");
    await expect(page.getByRole("heading", { level: 1, name: "Часовой пояс и валюта" })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Профиль заполнен" })).toHaveAttribute("aria-valuenow", "38");
    await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/onboarding/trainer/region")}`,
    );
  });

  test("signed out, the result screen goes back to the invite screen", async ({ page }) => {
    await page.goto("/onboarding/trainer/done");
    await expect(page).toHaveURL(/\/onboarding\/trainer$/);
  });

  test("signed out, the profile offers no trainer invite and no admin section", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("link", { name: "Войти через Telegram" })).toBeVisible();
    await expect(page.getByRole("link", { name: "У меня есть инвайт тренера" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Админка" })).toHaveCount(0);
  });
});

test.describe("client link and trainer code", () => {
  test("signed out, the trainer code screen asks to sign in and keeps the code", async ({ page }) => {
    await page.goto("/join?code=abc-def");
    await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/join?code=ABCDEF")}`,
    );
  });

  test("a malformed client link offers the trainer code instead", async ({ page }) => {
    await page.goto("/i/not-a-token");
    await expect(page.getByRole("heading", { name: "Ссылка недействительна" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Ввести код тренера" })).toHaveAttribute("href", "/join");
  });
});

test.describe("pairs", () => {
  // A pair id that is not a uuid is answered without the database, like a pair of someone else.
  for (const path of [
    "/trainer/clients/not-a-pair",
    "/trainer/clients/not-a-pair/notes",
    "/trainer/clients/not-a-pair/passes",
    "/trainer/clients/not-a-pair/payments",
    "/trainer/clients/claims/not-a-claim",
    "/client/trainers/not-a-pair",
    "/client/passes/not-a-pass",
  ]) {
    test(`${path} shows the not-found screen`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    });
  }

  test("signed out, the client list offers the QR and link screen", async ({ page }) => {
    await page.goto("/trainer/clients?filter=debt&q=anna");
    await expect(page.getByRole("link", { name: "Показать QR и ссылку" })).toHaveAttribute("href", "/trainer/links");
    await expect(page.getByRole("main").getByRole("link", { name: "Добавить клиента вручную" })).toHaveAttribute("href", "/trainer/clients/new");
    await expect(page.getByRole("link", { name: "Добавить клиента", exact: true })).toHaveAttribute("href", "/trainer/clients/new");
  });

  test("a card needs a name before anything is sent", async ({ page }) => {
    await page.goto("/trainer/clients/new");
    await expect(page.getByRole("link", { name: /Отправить ссылку или QR/ })).toHaveAttribute("href", "/trainer/links");
    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page.getByText("Напиши имя клиента")).toBeVisible();
  });
});

test.describe("tab bar at 360px", () => {
  // The narrowest screen the product supports (screens.md §1.1), as a phone.
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  const cases: readonly (readonly [Locale, Zone])[] = [
    ["ru", "trainer"],
    ["ru", "client"],
    ["en", "trainer"],
    ["en", "client"],
  ];
  for (const [locale, zone] of cases) {
    test(`no ${zone} tab label is cut in ${locale}, whichever tab is active`, async ({ page, context, baseURL }, testInfo) => {
      test.skip(!isPhone(testInfo), "the tab bar is the phone layout");
      await context.addCookies([{ name: "dafit-locale", value: locale, url: baseURL }]);
      const tabs = TABS[locale][zone];
      await page.goto(tabs[0][1]);
      const tabBar = page.getByRole("navigation", { name: NAV_LABEL[locale], exact: true });

      // Every tab active once: the active label is semibold and wider than the regular one.
      for (const [label, href] of tabs) {
        await tabBar.getByRole("link", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${href}$`));
        await expect(tabBar.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
        await page.evaluate(() => document.fonts.ready);
        // `truncate` clips the label: a cut one is wider inside than its box.
        const cut = await tabBar.getByRole("link").evaluateAll((links) =>
          links
            .filter((link) => {
              const text = link.querySelector("span");
              return text !== null && text.scrollWidth > text.clientWidth;
            })
            .map((link) => link.textContent),
        );
        expect(cut, `cut while ${label} is active`).toEqual([]);
      }
    });
  }
});

test.describe("profile, settings and back", () => {
  // The phone opens the profile from the avatar in the header, the desktop from the side menu.
  const openProfile = async (page: Page) => {
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Профиль" });
    await expect(sheet).toBeVisible();
    return sheet;
  };

  test("settings opened from the profile leave no sheet behind, with Back or the browser", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/trainer", { waitUntil: "networkidle" });

    await (await openProfile(page)).getByRole("link", { name: "Настройки" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
    await expectNoSheetLeft(page);

    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page).toHaveURL(/\/trainer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Сегодня" })).toBeVisible();
    await expectNoSheetLeft(page);

    await (await openProfile(page)).getByRole("link", { name: "Настройки" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/trainer$/);
    await expectNoSheetLeft(page);

    // The screen still takes taps, and the profile opens again as usual.
    await expect(await openProfile(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expectNoSheetLeft(page);
    expect(errors()).toEqual([]);
  });

  test("leaving the shell for sign-in, with the profile closed or still open, leaves no sheet behind", async ({ page }) => {
    await page.goto("/trainer", { waitUntil: "networkidle" });

    // Signed out in these tests: the profile offers to sign in, which leaves the shell for /login.
    await (await openProfile(page)).getByRole("link", { name: "Войти через Telegram" }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Ftrainer$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/trainer$/);
    await expectNoSheetLeft(page);

    // The browser leaves while the profile is open: Next.js hides the shell with the sheet in it.
    await openProfile(page);
    await page.goForward();
    await expect(page).toHaveURL(/\/login\?next=%2Ftrainer$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/trainer$/);
    await expect(page.getByRole("heading", { level: 1, name: "Сегодня" })).toBeVisible();
    await expectNoSheetLeft(page);
  });

  test("on a wide screen settings keep the side menu, with Настройки as the current item", async ({ page }, testInfo) => {
    test.skip(isPhone(testInfo), "the side menu is the layout from 768px");
    await page.goto("/trainer/clients", { waitUntil: "networkidle" });
    const menu = page.getByRole("navigation", { name: NAV_LABEL.ru, exact: true });

    await menu.getByRole("link", { name: "Настройки", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link", { name: "Настройки", exact: true })).toHaveAttribute("aria-current", "page");
    // The zone shown before stays, with none of its sections current.
    for (const [label, href] of TABS.ru.trainer) await expect(menu.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    await expect(page.locator('a[aria-current="page"]:visible')).toHaveCount(1);

    // Opened directly, settings show the zone visited last.
    await page.reload();
    await expect(menu.getByRole("link", { name: "Настройки", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(menu.getByRole("link", { name: "Клиенты", exact: true })).toHaveAttribute("href", "/trainer/clients");

    // On /profile no item is current.
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Профиль" })).toBeVisible();
    await expect(menu).toBeVisible();
    await expect(page.locator('a[aria-current="page"]:visible')).toHaveCount(0);
  });
});

test.describe("push and pop", () => {
  test("settings slide in from the right, and Back brings the screen back from the left", async ({ page }) => {
    await recordAnimations(page);
    await page.goto("/trainer", { waitUntil: "networkidle" });
    // A page load or a reload shows the screen at once.
    expect(screenSlideStart(await takeAnimations(page))).toBeNull();

    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    await page.getByRole("dialog", { name: "Профиль" }).getByRole("link", { name: "Настройки" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect.poll(async () => screenSlideStart(await takeAnimations(page))).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page).toHaveURL(/\/trainer$/);
    await expect.poll(async () => screenSlideStart(await takeAnimations(page))).toBeLessThan(0);

    // Nothing is left on the screen wrapper: a transform there would trap position: fixed elements.
    await settle(page);
    await expect.poll(() => page.locator("main#main > div").evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  });

  test("the side menu's Настройки switches like a tab: a crossfade, no slide", async ({ page }, testInfo) => {
    test.skip(isPhone(testInfo), "the side menu is the layout from 768px");
    await recordAnimations(page);
    await page.goto("/trainer", { waitUntil: "networkidle" });
    await takeAnimations(page);

    await page.getByRole("link", { name: "Настройки", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect.poll(async () => (await takeAnimations(page)).some((animation) => animation.screen)).toBe(true);
    await page.getByRole("link", { name: "Сегодня", exact: true }).click();
    await expect(page).toHaveURL(/\/trainer$/);
    await settle(page);
    // Neither direction slides; both are the tab crossfade.
    expect(screenSlideStart(await takeAnimations(page))).toBeNull();
  });

  test.describe("with reduced motion", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("screens only fade, within 100ms", async ({ page }) => {
      await recordAnimations(page);
      await page.goto("/trainer", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Профиль", exact: true }).click();
      await page.getByRole("dialog", { name: "Профиль" }).getByRole("link", { name: "Настройки" }).click();
      await expect(page).toHaveURL(/\/settings$/);
      await page.getByRole("button", { name: "Назад" }).click();
      await expect(page).toHaveURL(/\/trainer$/);

      const screen = (await takeAnimations(page)).filter((animation) => animation.screen);
      expect(screen.length).toBeGreaterThanOrEqual(2);
      for (const animation of screen) {
        expect(animation.keyframes.every((keyframe) => keyframe.transform === undefined)).toBe(true);
        expect(animation.duration).toBeLessThanOrEqual(100);
      }
    });
  });
});

test.describe("focus and the bars", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isPhone(testInfo), "the header bar and the tab bar are the phone layout");
  });

  /** Makes the screen long, with a focusable row in the middle, and scrolls to `y`. */
  const tallScreen = (page: Page, y: number) =>
    page.evaluate((top) => {
      const main = document.querySelector<HTMLElement>("main#main")!;
      if (!document.getElementById("probe-row")) {
        const row = document.createElement("button");
        row.id = "probe-row";
        row.textContent = "probe";
        row.style.cssText = "display:block;width:100%;height:52px;margin:1500px 0 3000px";
        main.append(row);
      }
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, top);
    }, y);
  const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

  test("focusing the header bar's own buttons doesn't scroll the page", async ({ page }) => {
    await page.goto("/trainer", { waitUntil: "networkidle" });
    await tallScreen(page, 1200);
    await expect.poll(() => scrollY(page)).toBe(1200);
    await page.getByRole("button", { name: "Профиль", exact: true }).focus();
    expect(await scrollY(page)).toBe(1200);

    await page.goto("/settings", { waitUntil: "networkidle" });
    await tallScreen(page, 1200);
    await expect.poll(() => scrollY(page)).toBe(1200);
    await page.getByRole("button", { name: "Назад" }).focus();
    expect(await scrollY(page)).toBe(1200);
  });

  test("focused content moves clear of the header bar and the tab bar", async ({ page }) => {
    await page.goto("/trainer", { waitUntil: "networkidle" });
    const row = page.locator("#probe-row");
    const bars = () =>
      page.evaluate(() => ({
        headerBottom: document.querySelector("main#main .material.fixed")!.getBoundingClientRect().bottom,
        tabBarTop: document.querySelector("nav.fixed")!.getBoundingClientRect().top,
      }));

    // Half under the header bar.
    await tallScreen(page, 0);
    await tallScreen(page, await row.evaluate((element) => element.getBoundingClientRect().top + window.scrollY - 20));
    await row.focus();
    const { headerBottom, tabBarTop } = await bars();
    expect((await row.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);

    // Half under the tab bar.
    await tallScreen(page, 0);
    await tallScreen(page, await row.evaluate((element) => element.getBoundingClientRect().top + window.scrollY - 844 + 20));
    await row.focus();
    const box = (await row.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(tabBarTop);
  });
});

test.describe("browser theme-color", () => {
  test.use({ colorScheme: "dark" });

  test("follows a theme pinned against the system, across navigations", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "dafit-theme", value: "light", url: baseURL! }]);
    const colors = () =>
      page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => meta.getAttribute("content")));

    await page.goto("/trainer", { waitUntil: "networkidle" });
    await expect.poll(colors).toEqual(["#f2f3f5"]);
    await page.getByRole("link", { name: "Клиенты", exact: true }).click();
    await expect(page).toHaveURL(/\/trainer\/clients$/);
    await expect.poll(colors).toEqual(["#f2f3f5"]);
  });
});

test.describe("language", () => {
  test("a saved English choice wins", async ({ page, context, baseURL }, testInfo) => {
    await context.addCookies([{ name: "dafit-locale", value: "en", url: baseURL }]);
    await page.goto("/trainer");

    await expect(html(page)).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle("Today | DaFit");
    await expectTabs(page, testInfo, "en", "trainer", "Today");
  });

  test("choosing English in settings switches the app", async ({ page, context }, testInfo) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "English", exact: true }).click();

    await expect(html(page)).toHaveAttribute("lang", "en");
    await expect(page.getByRole("radio", { name: "English", exact: true })).toHaveAttribute("aria-checked", "true");
    expect((await context.cookies()).find((cookie) => cookie.name === "dafit-locale")?.value).toBe("en");

    await page.goto("/client");
    await expectTabs(page, testInfo, "en", "client", "Home");
  });

  test.describe("with an English browser", () => {
    test.use({ locale: "en-US" });

    test("follows Accept-Language when nothing is saved", async ({ page }, testInfo) => {
      await page.goto("/client");
      await expect(html(page)).toHaveAttribute("lang", "en");
      await expectTabs(page, testInfo, "en", "client", "Home");
    });

    test("keeps a saved Russian choice", async ({ page, context, baseURL }, testInfo) => {
      await context.addCookies([{ name: "dafit-locale", value: "ru", url: baseURL }]);
      await page.goto("/client");
      await expect(html(page)).toHaveAttribute("lang", "ru");
      await expectTabs(page, testInfo, "ru", "client", "Главная");
    });
  });
});

test.describe("theme", () => {
  test.use({ colorScheme: "dark" });

  test("choosing Светлая pins light, and it survives a reload", async ({ page, context }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Светлая", exact: true }).click();

    await expect(html(page)).toHaveAttribute("data-theme", "light");
    expect((await context.cookies()).find((cookie) => cookie.name === "dafit-theme")?.value).toBe("light");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("radio", { name: "Светлая", exact: true })).toHaveAttribute("aria-checked", "true");

    // The pinned theme applies on every screen, before the first paint.
    await page.goto("/trainer");
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });

  test("choosing Тёмная pins dark on a light system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/settings");
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    await page.getByRole("radio", { name: "Тёмная", exact: true }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("Авто follows the system scheme, live", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("radio", { name: "Светлая", exact: true }).click();
    await page.getByRole("radio", { name: "Авто", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Авто", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("everything still renders and navigates", async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.goto("/trainer");
    const today = page.getByRole("heading", { level: 1, name: "Сегодня" }).first();
    await expect(today).toBeVisible();
    await expectOpaque(today);
    await expectTabs(page, testInfo, "ru", "trainer", "Сегодня");

    await page.getByRole("link", { name: "Расписание", exact: true }).click();
    await expect(page).toHaveURL(/\/trainer\/schedule$/);
    const schedule = page.getByRole("heading", { level: 1, name: "Расписание" }).first();
    await expect(schedule).toBeVisible();
    await expectOpaque(schedule);

    if (isPhone(testInfo)) {
      await page.getByRole("button", { name: "Профиль", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Профиль" });
      await expect(sheet).toBeVisible();
      await expectOpaque(sheet.getByRole("heading", { name: "Профиль" }));
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }

    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" }).first()).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Тема" })).toBeVisible();
    await settle(page);
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });
});
