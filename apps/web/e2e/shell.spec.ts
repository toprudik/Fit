import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectAccessible, expectOpaque, expectTabs, isPhone, SCHEMES, screenshotPath, settle } from "./support";

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
  { slug: "trainer-clients", path: "/trainer/clients", title: "Клиенты" },
  { slug: "trainer-money", path: "/trainer/money", title: "Деньги" },
  { slug: "trainer-more", path: "/trainer/more", title: "Ещё" },
  { slug: "client-home", path: "/client", title: "Главная" },
  { slug: "client-sessions", path: "/client/sessions", title: "Занятия" },
  { slug: "client-diary", path: "/client/diary", title: "Дневник" },
  { slug: "client-progress", path: "/client/progress", title: "Прогресс" },
  { slug: "client-trainers", path: "/client/trainers", title: "Тренеры" },
  { slug: "settings", path: "/settings", title: "Настройки" },
  { slug: "profile", path: "/profile", title: "Профиль" },
  { slug: "login", path: "/login", title: "Вход" },
  { slug: "not-found", path: "/no-such-page", title: "Такой страницы нет", documentTitle: false, status: 404 },
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
        // Known bug: an unknown path is served as Next's "__next_error__" shell and the whole
        // document renders on the client, where the inline themeInitScript never runs, so the page
        // stays in the dark default on a light system. Remove this line once that is fixed.
        test.fail(screen.status === 404 && scheme === "light", "not-found ignores the light scheme");
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

    test("the profile sheet opened from the avatar passes axe", async ({ page }, testInfo) => {
      test.skip(!isPhone(testInfo), "On a phone the avatar sits in the header; the desktop opens the profile from the side menu.");
      await page.goto("/trainer", { waitUntil: "networkidle" });

      await page.getByRole("button", { name: "Профиль", exact: true }).click();
      const sheet = page.getByRole("dialog", { name: "Профиль" });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("radiogroup", { name: "Зона" })).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Настройки" })).toBeVisible();

      await settle(page);
      await expectAccessible(page);
      await page.screenshot({ path: screenshotPath(testInfo, scheme, "profile-sheet"), fullPage: true });

      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    });
  });
}

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
