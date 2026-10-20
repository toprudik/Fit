import { expect, test } from "@playwright/test";
import { collectErrors, expectAccessible, SCHEMES, screenshotPath, settle } from "./support";

/*
 * Content reports (DSA arts. 16, 17, 20): "Жалобы" renders for everyone, signed out it is just empty;
 * the admin queue is a 404 for everyone but admins, like the rest of /admin (ADM-12).
 */
const SCREENS = [
  { slug: "reports-signed-out", path: "/reports", title: "Жалобы", status: 200 },
  { slug: "admin-reports-denied", path: "/admin/reports", title: "Такой страницы нет", status: 404 },
  { slug: "admin-report-denied", path: "/admin/reports/00000000-0000-4000-8000-000000000000", title: "Такой страницы нет", status: 404 },
];

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const screen of SCREENS) {
      test(`${screen.path} renders, passes axe and is captured`, async ({ page }, testInfo) => {
        const errors = collectErrors(page, screen.status === 404 ? [/Failed to load resource.*404/] : []);
        const response = await page.goto(screen.path, { waitUntil: "networkidle" });
        expect(response?.status()).toBe(screen.status);
        await expect(page.getByRole("heading", { name: screen.title, exact: true }).first()).toBeVisible();
        if (screen.status === 200) {
          await expect(page).toHaveTitle(`${screen.title} | DaFit`);
          await expect(page.getByText("Жалоб и решений нет.")).toBeVisible();
        }
        await settle(page);
        await expectAccessible(page);
        await page.screenshot({ path: screenshotPath(testInfo, scheme, screen.slug), fullPage: true });
        expect(errors()).toEqual([]);
      });
    }
  });
}
