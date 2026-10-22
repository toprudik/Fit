import { expect, test, type Page } from "@playwright/test";
import { collectErrors, isPhone } from "./support";
import {
  backButtonVisible,
  expectChrome,
  expectMiniAppReady,
  lastPosted,
  openInTelegram,
  posted,
  receive,
  TELEGRAM_THEMES,
  verticalSwipesAllowed,
} from "./telegram-support";

/*
 * The Mini App inside a stand-in Telegram client (telegram-support.ts): theme and chrome colors
 * (ADR 0010), the native buttons and haptics from screens.md §1.5, and the fallback to the website
 * when the launch params can't be read.
 */

const html = (page: Page) => page.locator("html");
// The launch hash stays in the URL until the first navigation, so compare paths.
const pathname = (page: Page) => new URL(page.url()).pathname;
const radio = (page: Page, name: string) => page.getByRole("radio", { name, exact: true });

// DaFit's bg per theme, written out here so the test does not trust the code it checks.
const BG = { dark: "#000000", light: "#f2f3f5" };

test.describe("theme inside Telegram", () => {
  test("Авто follows a dark Telegram over a light system, and Telegram's chrome turns black", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    const errors = collectErrors(page);
    await openInTelegram(page, "/trainer", { theme: "dark" });
    await expectMiniAppReady(page);

    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expectChrome(page, BG.dark);
    expect(errors()).toEqual([]);
  });

  test("a light Telegram gives the light theme and a light chrome", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openInTelegram(page, "/trainer", { theme: "light" });
    await expectMiniAppReady(page);

    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expectChrome(page, BG.light);
  });

  test("Светлая pinned in a dark Telegram wins, and Авто brings Telegram's dark back", async ({ page }) => {
    await openInTelegram(page, "/settings", { theme: "dark" });
    await expectMiniAppReady(page);
    await expectChrome(page, BG.dark);

    await radio(page, "Светлая").click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expectChrome(page, BG.light);

    await radio(page, "Авто").click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expectChrome(page, BG.dark);

    // Still Telegram's scheme after a reload, when the launch hash is gone.
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
  });

  test("Светлая saved to the account on another device applies as soon as the sign-in answers", async ({ page }) => {
    const errors = collectErrors(page);
    await openInTelegram(page, "/settings", { theme: "dark", signIn: { status: 200, body: { ok: true, fresh: false, theme: "light" } } });
    await expectMiniAppReady(page);

    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expect(radio(page, "Светлая")).toHaveAttribute("aria-checked", "true");
    await expectChrome(page, BG.light);
    expect(errors()).toEqual([]);
  });

  test("Тёмная pinned in a light Telegram paints the chrome black", async ({ page }) => {
    await openInTelegram(page, "/settings", { theme: "light" });
    await expectMiniAppReady(page);
    await expectChrome(page, BG.light);

    await radio(page, "Тёмная").click();
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await expectChrome(page, BG.dark);
  });

  test("Авто follows Telegram switching to light while the app is open", async ({ page }) => {
    await openInTelegram(page, "/trainer", { theme: "dark" });
    await expectMiniAppReady(page);
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await receive(page, "theme_changed", { theme_params: TELEGRAM_THEMES.light });

    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await expectChrome(page, BG.light);
  });
});

test.describe("Telegram's buttons", () => {
  test("stays put: vertical swipes off from the start, closing asks first, fullscreen on a phone", async ({ page }) => {
    await openInTelegram(page, "/client");
    await expectMiniAppReady(page);
    await expect.poll(() => verticalSwipesAllowed(page)).toBe(false);
    expect(await lastPosted(page, "web_app_setup_closing_behavior")).toEqual({ need_confirmation: true });
    expect((await posted(page)).some(([type]) => type === "web_app_expand")).toBe(true);
    await expect.poll(async () => (await posted(page)).some(([type]) => type === "web_app_request_fullscreen")).toBe(true);
  });

  test("on a computer: full height, no fullscreen", async ({ page }) => {
    await openInTelegram(page, "/client", { platform: "tdesktop" });
    await expectMiniAppReady(page);
    expect((await posted(page)).some(([type]) => type === "web_app_expand")).toBe(true);
    // The viewport is mounted (it asked for the safe areas) before fullscreen would be asked for.
    await expect.poll(async () => (await posted(page)).some(([type]) => type === "web_app_request_safe_area")).toBe(true);
    expect((await posted(page)).some(([type]) => type === "web_app_request_fullscreen")).toBe(false);
  });

  test("BackButton: hidden on a tab root, shown while the profile sheet is open, swipes off throughout", async ({ page }) => {
    await openInTelegram(page, "/trainer");
    await expectMiniAppReady(page);
    expect(await backButtonVisible(page)).toBe(false);
    await expect.poll(() => verticalSwipesAllowed(page)).toBe(false);

    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Профиль" });
    await expect(sheet).toBeVisible();
    await expect.poll(() => backButtonVisible(page)).toBe(true);
    await expect.poll(() => verticalSwipesAllowed(page)).toBe(false);

    // Telegram's BackButton closes the sheet and lets go of the button; swipes stay off for the app.
    await receive(page, "back_button_pressed");
    await expect(sheet).toBeHidden();
    await expect.poll(() => backButtonVisible(page)).toBe(false);
    expect(await verticalSwipesAllowed(page)).toBe(false);
    expect(pathname(page)).toBe("/trainer");
  });

  test("a tab of the tab bar shows only «Закрыть», and a screen in it gets «Назад» up to the tab", async ({ page }) => {
    await openInTelegram(page, "/trainer");
    await expectMiniAppReady(page);
    const nav = page.getByRole("navigation", { name: "Разделы" }).filter({ visible: true });
    for (const [name, path] of [["Расписание", "/trainer/schedule"], ["Клиенты", "/trainer/clients"], ["Ещё", "/trainer/more"]]) {
      await expect(async () => {
        await nav.getByRole("link", { name, exact: true }).click();
        await expect.poll(() => pathname(page), { timeout: 2000 }).toBe(path);
      }).toPass();
      // Rudik 22.10: a tab is a top level of its own, so Telegram shows «Закрыть» there, not «Назад».
      await expect.poll(() => backButtonVisible(page)).toBe(false);
    }

    await page.getByRole("main").getByRole("link", { name: /QR и ссылка/ }).click();
    await expect.poll(() => pathname(page)).toBe("/trainer/links");
    await expect.poll(() => backButtonVisible(page)).toBe(true);
    await receive(page, "back_button_pressed");
    await expect.poll(() => pathname(page)).toBe("/trainer/more");
    await expect.poll(() => backButtonVisible(page)).toBe(false);
  });

  test("a tab opened directly shows only «Закрыть»", async ({ page }) => {
    await openInTelegram(page, "/trainer/more");
    await expectMiniAppReady(page);
    await expect(page.getByRole("heading", { level: 1, name: "Ещё" }).first()).toBeVisible();
    await expect.poll(() => backButtonVisible(page)).toBe(false);
  });

  test("BackButton replaces the web Back button on a pushed screen and pops it", async ({ page }) => {
    await openInTelegram(page, "/settings");
    await expectMiniAppReady(page);

    await expect(page.getByRole("heading", { level: 1, name: "Настройки" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Назад", exact: true })).toHaveCount(0);
    await expect.poll(() => backButtonVisible(page)).toBe(true);

    await receive(page, "back_button_pressed");
    await expect.poll(() => pathname(page)).not.toBe("/settings");
    await expect.poll(() => backButtonVisible(page)).toBe(false);
  });

  test("Settings in Telegram's menu opens /settings", async ({ page }) => {
    await openInTelegram(page, "/client");
    await expectMiniAppReady(page);
    expect(await lastPosted(page, "web_app_setup_settings_button")).toEqual({ is_visible: true });

    await receive(page, "settings_button_pressed");
    await expect.poll(() => pathname(page)).toBe("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" }).first()).toBeVisible();
  });

  test("Settings pressed over the open profile sheet leaves no sheet behind, and BackButton returns", async ({ page }) => {
    await openInTelegram(page, "/trainer");
    await expectMiniAppReady(page);
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();

    await receive(page, "settings_button_pressed");
    await expect.poll(() => pathname(page)).toBe("/settings");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => backButtonVisible(page)).toBe(true);
    expect(await verticalSwipesAllowed(page)).toBe(false);

    await receive(page, "back_button_pressed");
    await expect.poll(() => pathname(page)).toBe("/trainer");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => backButtonVisible(page)).toBe(false);
  });

  test("a tab change taps lightly", async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo), "The tab bar is the phone's");
    await openInTelegram(page, "/trainer");
    await expectMiniAppReady(page);

    await page.getByRole("link", { name: "Клиенты", exact: true }).click();
    await expect.poll(() => pathname(page)).toBe("/trainer/clients");
    await expect.poll(() => lastPosted(page, "web_app_trigger_haptic_feedback")).toEqual({ type: "impact", impact_style: "light" });
  });

  test("fullscreen: the title sits between Telegram's buttons, the profile moves to the tab bar", async ({ page }, testInfo) => {
    test.skip(!isPhone(testInfo), "Fullscreen is the phone's");
    const errors = collectErrors(page);
    await openInTelegram(page, "/client");
    await expectMiniAppReady(page);
    // A notched phone: the status bar, then the row with «Закрыть» and «⌄ ⋯». The viewport asks for
    // the insets one after another and takes each answer only after asking.
    const answer = async (request: string, event: string, data: Record<string, unknown>) => {
      await expect.poll(async () => (await posted(page)).some(([type]) => type === request)).toBe(true);
      await receive(page, event, data);
    };
    await answer("web_app_request_safe_area", "safe_area_changed", { top: 59, bottom: 34, left: 0, right: 0 });
    await answer("web_app_request_content_safe_area", "content_safe_area_changed", { top: 46, bottom: 0, left: 0, right: 0 });
    await answer("web_app_request_viewport", "viewport_changed", { height: 844, width: 390, is_expanded: true, is_state_stable: true });

    const bar = page.locator('[data-slot="screen-bar"]');
    const title = page.getByRole("heading", { level: 1, name: "Главная" });
    await expect(title).toBeVisible();
    const width = page.viewportSize()?.width ?? 0;
    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Inside Telegram's row, clear of its buttons on both sides.
      expect(box.y).toBeGreaterThanOrEqual(59);
      expect(box.y + box.height).toBeLessThanOrEqual(59 + 46);
      expect(box.x).toBeGreaterThanOrEqual(116);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 96);
      // In the middle of the screen, not of the room between the buttons (Rudik 22.10).
      expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    }
    // The date stays under the title; the avatar is not in the row, nothing sits between the row and the content.
    await expect(bar).toContainText(/\d/);
    await expect(bar.getByRole("button")).toHaveCount(0);
    await expect(page.locator('[data-slot="screen-title"]')).toBeHidden();

    // Scrolling keeps the row as it is.
    await page.mouse.wheel(0, 600);
    await expect(title).toBeVisible();

    // The last tab is «Профиль» now; its screen starts with the row that opens the profile sheet.
    await page.getByRole("link", { name: "Профиль", exact: true }).click();
    await expect.poll(() => pathname(page)).toBe("/client/trainers");
    await expect(page.getByRole("heading", { level: 1, name: "Профиль" })).toBeVisible();
    await page.getByRole("button", { name: /Аккаунт, режим и настройки/ }).click();
    await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();
    expect(errors()).toEqual([]);
  });
});

test.describe("sign-in inside Telegram", () => {
  test("sends initData once and stays put when the session already exists", async ({ page }) => {
    const errors = collectErrors(page);
    const signIns = await openInTelegram(page, "/client");
    await expectMiniAppReady(page);

    await expect.poll(() => signIns.length).toBe(1);
    expect(JSON.parse(signIns[0]).initData).toContain("auth_date=");
    await expect(page.getByRole("heading", { level: 1, name: "Главная" }).first()).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a failed sign-in says so in a toast at the top", async ({ page }) => {
    const errors = collectErrors(page, [/Failed to load resource.*401/]);
    await openInTelegram(page, "/client", { signIn: { status: 401, body: { error: "invalid" } } });

    const toast = page.getByText("Не удалось войти, открой приложение заново");
    await expect(toast).toBeVisible();
    await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute("data-y-position", "top");
    const box = await toast.boundingBox();
    expect(box && box.y).toBeLessThan((page.viewportSize()?.height ?? 0) / 2);
    expect(errors()).toEqual([]);
  });

  test("sends initData again after a full page load, when the launch hash is gone", async ({ page }) => {
    const signIns = await openInTelegram(page, "/client");
    await expect.poll(() => signIns.length).toBe(1);

    await page.goto("/trainer");
    await expectMiniAppReady(page);
    await expect.poll(() => signIns.length).toBe(2);
    expect(signIns[1]).toBe(signIns[0]);
  });
});

/*
 * Telegram's login page for websites (OIDC on oauth.telegram.org) does not load inside the Mini App.
 * There /login signs in from initData instead, and the app has no sign-out that would lead there.
 */
test.describe("/login inside Telegram", () => {
  const SIGN_IN = "Войти через Telegram";
  const websiteLogin = (page: Page) => page.locator('a[href^="/auth/telegram/login"]');
  const signInButton = (page: Page) => page.getByRole("button", { name: SIGN_IN, exact: true });
  const reopen = (page: Page) => page.getByText("Данные для входа от Telegram устарели или не пришли. Закрой приложение и открой его снова.");
  /** The profile sheet's way in: a client-side navigation to /login, the sign-in status stays as it was. */
  async function openProfileSignIn(page: Page) {
    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    await page.getByRole("dialog", { name: "Профиль" }).getByRole("link", { name: SIGN_IN }).click();
  }

  test("where sign-out used to land, signs in from initData and opens the app", async ({ page }) => {
    const errors = collectErrors(page);
    const signIns = await openInTelegram(page, "/client");
    await expect.poll(() => signIns.length).toBe(1);

    // Sign-out ended with a redirect to /login: a full page load, without the launch hash.
    await page.goto("/login");
    await expect.poll(() => pathname(page)).toBe("/client");
    await expect(page.getByRole("heading", { level: 1, name: "Главная" }).first()).toBeVisible();
    expect(signIns).toHaveLength(2);
    expect(errors()).toEqual([]);
  });

  test("a failed sign-in says so, and the button tries again, then goes on to `next`", async ({ page }) => {
    const errors = collectErrors(page, [/Failed to load resource.*500/]);
    const signIns = await openInTelegram(page, "/login?next=%2Fclient%2Fprogress", {
      signIn: [
        { status: 500, body: { error: "sign_in_failed" } },
        { status: 200, body: { ok: true, fresh: true } },
      ],
    });

    await expect(page.getByText("Не удалось войти через Telegram, попробуй ещё раз.")).toBeVisible();
    await expect(websiteLogin(page)).toHaveCount(0);
    // The page says it itself, so no toast repeats it.
    await expect(page.getByText("Не удалось войти, открой приложение заново")).toHaveCount(0);

    await signInButton(page).click();
    await expect.poll(() => pathname(page)).toBe("/client/progress");
    expect(signIns).toHaveLength(2);
    expect(errors()).toEqual([]);
  });

  test("initData the server no longer accepts asks to reopen the app, with nothing to press", async ({ page }) => {
    const errors = collectErrors(page, [/Failed to load resource.*401/]);
    await openInTelegram(page, "/login", { signIn: { status: 401, body: { error: "invalid_init_data" } } });

    await expect(reopen(page)).toBeVisible();
    await expect(signInButton(page)).toHaveCount(0);
    await expect(websiteLogin(page)).toHaveCount(0);
    expect(pathname(page)).toBe("/login");
    expect(errors()).toEqual([]);
  });

  test("launch params tma.js can't read ask to reopen the app", async ({ page }) => {
    const errors = collectErrors(page);
    const signIns = await openInTelegram(page, "/login", { unsigned: true });

    await expect(reopen(page)).toBeVisible();
    await expect(signInButton(page)).toHaveCount(0);
    await expect(websiteLogin(page)).toHaveCount(0);
    expect(signIns).toEqual([]);
    expect(errors()).toEqual([]);
  });

  test("after a failed sign-in, the profile's sign-in tries initData again and comes back to the screen", async ({ page }) => {
    const errors = collectErrors(page, [/Failed to load resource.*500/]);
    const signIns = await openInTelegram(page, "/trainer", {
      signIn: [
        { status: 500, body: { error: "sign_in_failed" } },
        { status: 200, body: { ok: true, fresh: true } },
      ],
    });
    const toast = page.getByText("Не удалось войти, открой приложение заново");
    await expect(toast).toBeVisible();
    // On a phone the toast covers the avatar, and a pointer over it holds the toast open: wait it out.
    await expect(toast).toBeHidden({ timeout: 10_000 });

    await openProfileSignIn(page);
    await expect.poll(() => pathname(page)).toBe("/trainer");
    await expect(page.getByRole("heading", { level: 1, name: "Сегодня" })).toBeVisible();
    expect(signIns).toHaveLength(2);
    expect(errors()).toEqual([]);
  });

  // The session may be gone since the sign-in of this page load: it expired, or a sign-out on the
  // website ended every session. /login asks the server again instead of trusting that answer.
  test("after a sign-in that worked, the profile's sign-in sends initData again before going back", async ({ page }) => {
    const errors = collectErrors(page);
    const signIns = await openInTelegram(page, "/trainer");
    await expect.poll(() => signIns.length).toBe(1);

    await openProfileSignIn(page);
    await expect.poll(() => signIns.length).toBe(2);
    await expect.poll(() => pathname(page)).toBe("/trainer");
    expect(signIns[1]).toBe(signIns[0]);
    expect(errors()).toEqual([]);
  });

  test("when the server no longer takes initData there, /login asks to reopen the app instead of going back", async ({ page }) => {
    const errors = collectErrors(page, [/Failed to load resource.*401/]);
    const signIns = await openInTelegram(page, "/trainer", {
      signIn: [
        { status: 200, body: { ok: true, fresh: false } },
        { status: 401, body: { error: "invalid_init_data" } },
      ],
    });
    await expect.poll(() => signIns.length).toBe(1);

    await openProfileSignIn(page);
    await expect(reopen(page)).toBeVisible();
    expect(pathname(page)).toBe("/login");
    expect(signIns).toHaveLength(2);
    expect(errors()).toEqual([]);
  });

  test("a crafted `next` never leads to Telegram's login for websites", async ({ page }) => {
    const oauth: string[] = [];
    await page.route(/oauth\.telegram\.org/, async (route) => {
      oauth.push(route.request().url());
      await route.abort();
    });
    const signIns = await openInTelegram(page, "/login?next=%2Fauth%2Ftelegram%2Flogin");

    // "/" opens the last zone, the client zone for a new user.
    await expect.poll(() => pathname(page)).toBe("/client");
    expect(signIns).toHaveLength(1);
    expect(oauth).toEqual([]);
  });

  test("before the app starts, shows a busy button instead of the website's link", async ({ page }) => {
    // Scripts held back, as on a slow connection: the server's HTML is all there is.
    let releaseScripts = () => {};
    const scripts = new Promise<void>((resolve) => (releaseScripts = resolve));
    await page.route(
      (url) => url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js"),
      async (route) => {
        await scripts;
        await route.continue();
      },
    );
    const signIns = await openInTelegram(page, "/login?next=%2Fclient%2Fprogress", { waitUntil: "commit" });

    await expect(signInButton(page)).toBeVisible();
    await expect(signInButton(page)).toBeDisabled();
    await expect(websiteLogin(page)).toHaveCount(1);
    await expect(websiteLogin(page)).toBeHidden();
    expect(signIns).toEqual([]);

    releaseScripts();
    await expect.poll(() => pathname(page)).toBe("/client/progress");
    expect(signIns).toHaveLength(1);
  });

  test("on the website /login keeps Telegram's website login", async ({ page }) => {
    await page.goto("/login?next=%2Fclient");
    await expect(page.getByRole("link", { name: SIGN_IN, exact: true })).toHaveAttribute("href", "/auth/telegram/login?next=%2Fclient");
  });
});

test("launch params tma.js can't read leave the plain website, without errors", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  const signIns = await openInTelegram(page, "/settings", { unsigned: true });

  await expect(page.getByRole("heading", { level: 1, name: "Настройки" }).first()).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Тема" })).toBeVisible();
  // The website's own Back button is there (on a phone in the header bar, from 768px above the title).
  if (isPhone(testInfo)) await expect(page.getByRole("button", { name: "Назад", exact: true }).first()).toBeVisible();
  // Give the app time to start, then check it never went live as a Mini App.
  await page.waitForLoadState("networkidle");
  expect((await posted(page)).map(([type]) => type)).not.toContain("web_app_ready");
  expect(signIns).toEqual([]);
  expect(errors()).toEqual([]);
});
