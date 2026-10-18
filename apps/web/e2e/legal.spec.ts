import { expect, test } from "@playwright/test";
import { collectErrors, expectAccessible, SCHEMES, screenshotPath, settle } from "./support";

/*
 * The legal documents (/legal): public, readable before signing in, in both themes, at phone and
 * desktop width, without the page ever scrolling sideways (wide tables scroll on their own).
 */
const DOCUMENTS = [
  { path: "/legal", title: "Документы" },
  { path: "/legal/privacy", title: "Политика DaFit в отношении обработки персональных данных" },
  { path: "/legal/cookies", title: "Уведомление об использовании cookie" },
];

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const document of DOCUMENTS) {
      test(`${document.path} renders, passes axe and fits the width`, async ({ page }, testInfo) => {
        const errors = collectErrors(page);
        const response = await page.goto(document.path, { waitUntil: "networkidle" });
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: document.title })).toBeVisible();
        await settle(page);
        await expectAccessible(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        await page.screenshot({ path: screenshotPath(testInfo, scheme, `legal${document.path.slice("/legal".length).replaceAll("/", "-")}`), fullPage: true });
        expect(errors()).toEqual([]);
      });
    }
  });
}

test("the list leads to a document, its links to other documents, and back", async ({ page }) => {
  await page.goto("/legal");
  await page.getByRole("link", { name: "Пользовательское соглашение DaFit" }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await expect(page.getByText(/^Юристу:/)).toHaveCount(0);
  await page.getByRole("link", { name: "Все документы" }).click();
  await expect(page).toHaveURL(/\/legal$/);
});

test("an English reader gets the international set, and a Russian-only document is a 404", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "dafit-locale", value: "en", url: baseURL! }]);
  await page.goto("/legal/terms");
  await expect(page.getByRole("heading", { level: 1, name: "DaFit Terms of Service" })).toBeVisible();
  const response = await page.goto("/legal/personal-data");
  expect(response?.status()).toBe(404);
});
