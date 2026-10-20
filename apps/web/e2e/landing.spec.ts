import { expect, test } from "@playwright/test";
import { collectErrors, expectAccessible, SCHEMES, screenshotPath, settle } from "./support";

/*
 * «DaFit для тренеров» at /for-trainers (marketing backlog item 10) in both projects (phone, desktop) and both
 * themes: it opens signed out, is accessible and offers the waitlist form and sign-in.
 */

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("/for-trainers renders, passes axe and is captured", async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      const response = await page.goto("/for-trainers?src=ch_vk", { waitUntil: "networkidle" });

      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "ru");
      await expect(page.getByRole("heading", { level: 1, name: "Да, было." })).toBeVisible();
      await expect(page).toHaveTitle("Для тренеров | DaFit");
      await expect(page.getByRole("heading", { level: 2, name: "Лист ожидания" })).toBeVisible();
      await expect(page.getByLabel("Контакт для связи")).toBeVisible();
      await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute(
        "href",
        `/login?next=${encodeURIComponent("/for-trainers")}`,
      );

      await settle(page);
      await expectAccessible(page);
      await page.screenshot({ path: screenshotPath(testInfo, scheme, "for-trainers"), fullPage: true });
      expect(errors()).toEqual([]);
    });
  });
}

test("/for-trainers speaks English to an English browser", async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "dafit-locale", value: "en", url: baseURL }]);
  await page.goto("/for-trainers", { waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1, name: "Yes, done." })).toBeVisible();
  await expect(page).toHaveURL(/\/for-trainers$/);
});

test("the form asks for the consent before anything is sent", async ({ page }) => {
  await page.goto("/for-trainers", { waitUntil: "networkidle" });
  await page.getByLabel("Как тебя зовут").fill("Тренер Тест");
  await page.getByLabel("Контакт для связи").fill("@trainer_test");
  await page.getByRole("button", { name: "Записаться", exact: true }).click();
  // The browser stops the form on the unticked required box: the page stays a form.
  await expect(page.getByRole("checkbox")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ты в листе ожидания" })).toHaveCount(0);
});

test("signed out, the admin waitlist is a 404", async ({ page }) => {
  const response = await page.goto("/admin/waitlist");
  expect(response?.status()).toBe(404);
});

/* «Калькулятор цен на пакеты» at /for-trainers/calculator (marketing backlog item 9): public, both themes. */
for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme, calculator`, () => {
    test.use({ colorScheme: scheme });

    test("/for-trainers/calculator renders, passes axe and is captured", async ({ page }, testInfo) => {
      const errors = collectErrors(page);
      const response = await page.goto("/for-trainers/calculator?src=ch_vk", { waitUntil: "networkidle" });

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Калькулятор цен на пакеты" })).toBeVisible();
      await expect(page.getByLabel("Пакет на 10 занятий")).toHaveValue("16000");
      await expect(page.getByRole("link", { name: "Вести абонементы в DaFit" })).toHaveAttribute("href", "/for-trainers?src=ch_vk#waitlist");

      await settle(page);
      await expectAccessible(page);
      await page.screenshot({ path: screenshotPath(testInfo, scheme, "price-calculator"), fullPage: true });
      expect(errors()).toEqual([]);
    });
  });
}

test("the calculator recounts the grid as the drop-in price changes", async ({ page }) => {
  await page.goto("/for-trainers/calculator", { waitUntil: "networkidle" });
  await page.getByLabel("Цена разового занятия").fill("3000");
  await expect(page.getByLabel("Пакет на 20 занятий")).toHaveValue("45000");
  await expect(page.getByRole("link", { name: "Вести абонементы в DaFit" })).toHaveAttribute("href", "/for-trainers?src=price_calc#waitlist");
  await page.getByRole("link", { name: "Про DaFit" }).click();
  await expect(page.getByRole("link", { name: "Открыть калькулятор" })).toBeVisible();
});

test("signed out, the admin referral bonuses are a 404", async ({ page }) => {
  const response = await page.goto("/admin/referral-bonuses");
  expect(response?.status()).toBe(404);
});
