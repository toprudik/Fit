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
  test("BackButton: hidden on a tab root, shown while the profile sheet is open, with swipes locked", async ({ page }) => {
    await openInTelegram(page, "/trainer");
    await expectMiniAppReady(page);
    expect(await backButtonVisible(page)).toBe(false);
    expect(await verticalSwipesAllowed(page)).toBe(true);

    await page.getByRole("button", { name: "Профиль", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Профиль" });
    await expect(sheet).toBeVisible();
    await expect.poll(() => backButtonVisible(page)).toBe(true);
    await expect.poll(() => verticalSwipesAllowed(page)).toBe(false);

    // Telegram's BackButton closes the sheet and lets go of both.
    await receive(page, "back_button_pressed");
    await expect(sheet).toBeHidden();
    await expect.poll(() => backButtonVisible(page)).toBe(false);
    await expect.poll(() => verticalSwipesAllowed(page)).toBe(true);
    expect(pathname(page)).toBe("/trainer");
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
    await expect.poll(() => verticalSwipesAllowed(page)).toBe(true);

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
