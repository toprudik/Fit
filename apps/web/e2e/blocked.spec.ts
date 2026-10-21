import { expect, test, type Page } from "@playwright/test";
import { collectErrors, expectAccessible } from "./support";
import { openInTelegram } from "./telegram-support";

/*
 * A blocked account at sign-in (ADM-7, user agreement 15): the admin's reason, or a general line when there is
 * none, and where to appeal. On the website the OIDC callback leaves the reason in a short-lived cookie; inside
 * Telegram it comes with the sign-in answer.
 */

const REASON = "Спам в отзывах тренеров";
// Next's route announcer is an alert too.
const alert = (page: Page) => page.getByRole("alert").filter({ hasText: "заблокирован" });
const terms = (page: Page) => page.getByRole("link", { name: "Открыть соглашение" });

test("on the website /login shows the admin's reason from the callback and the way to appeal", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "fit_blocked", value: Buffer.from(REASON, "utf8").toString("base64url"), url: `${baseURL}/login`, httpOnly: true },
  ]);
  await page.goto("/login?error=blocked");

  await expect(alert(page)).toContainText("Твой аккаунт в DaFit заблокирован.");
  await expect(alert(page)).toContainText(`Причина: ${REASON}`);
  await expect(terms(page)).toHaveAttribute("href", "/legal/terms");
  await expectAccessible(page);

  // The terms open without a session: that is where the appeal address is.
  await terms(page).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("without a reason /login says what usually leads to a block", async ({ page }) => {
  await page.goto("/login?error=blocked");
  await expect(alert(page)).toContainText("Так бывает, если нарушены правила сервиса.");
  await expect(terms(page)).toBeVisible();
});

test("inside Telegram the reason comes with the sign-in answer, with nothing to press", async ({ page }) => {
  const errors = collectErrors(page, [/Failed to load resource.*403/]);
  await openInTelegram(page, "/login", { signIn: { status: 403, body: { error: "account_blocked", reason: REASON } } });

  await expect(alert(page)).toContainText(`Причина: ${REASON}`);
  await expect(page.getByRole("button", { name: "Войти через Telegram" })).toHaveCount(0);
  // A link of the app itself: the terms open inside the Mini App, still without a session.
  await terms(page).click();
  await expect(page).toHaveURL(/\/legal\/terms/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors()).toEqual([]);
});
