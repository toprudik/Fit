import { expect, test } from "@playwright/test";
import { collectErrors, expectAccessible, SCHEMES, screenshotPath, settle } from "./support";

/*
 * Help (FAQ) for both zones, in both projects (phone, desktop) and both themes: the screen renders,
 * answers open without a script, it passes axe and gets a screenshot for design review.
 */

const SCREENS = [
  { zone: "trainer", path: "/trainer/help", first: "Как стать тренером в DaFit?", answer: /Зону «Тренер» открывает инвайт/ },
  { zone: "client", path: "/client/help", first: "Как начать заниматься у тренера?", answer: /Открой ссылку или QR тренера/ },
] as const;

for (const scheme of SCHEMES) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const screen of SCREENS) {
      test(`${screen.path} renders, opens an answer, passes axe and is captured`, async ({ page }, testInfo) => {
        const errors = collectErrors(page);
        const response = await page.goto(screen.path, { waitUntil: "networkidle" });

        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { name: "Помощь", exact: true, level: 1 })).toBeVisible();
        await expect(page).toHaveTitle("Помощь | DaFit");
        // The account section closes both screens.
        await expect(page.getByRole("heading", { name: "Аккаунт и безопасность", level: 2 })).toBeVisible();

        const answer = page.getByText(screen.answer);
        await expect(answer).toBeHidden();
        await page.getByText(screen.first, { exact: true }).click();
        await expect(answer).toBeVisible();

        await settle(page);
        await expectAccessible(page);
        await page.screenshot({ path: screenshotPath(testInfo, scheme, `help-${screen.zone}`), fullPage: true });
        expect(errors()).toEqual([]);
      });
    }
  });
}

test("a topic chip jumps to its section", async ({ page }) => {
  await page.goto("/client/help", { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Темы" }).getByRole("link", { name: "Дневник и питание" }).click();
  await expect(page).toHaveURL(/#help-\d+$/);
  await expect(page.getByRole("heading", { name: "Дневник и питание", level: 2 })).toBeInViewport();
});

test("«Ещё» leads to the trainer's help, and the feedback button keeps where it came from", async ({ page }) => {
  await page.goto("/trainer/more", { waitUntil: "networkidle" });
  await page.getByRole("link", { name: /Помощь/ }).click();
  await expect(page).toHaveURL(/\/trainer\/help$/);
  await expect(page.getByRole("link", { name: "Написать в DaFit" })).toHaveAttribute("href", "/feedback?from=%2Ftrainer%2Fhelp");
});

test("the profile offers help for the zone it was opened in", async ({ page }) => {
  await page.goto("/client", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Профиль", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Профиль" });
  await expect(sheet.getByRole("link", { name: "Помощь" })).toHaveAttribute("href", "/client/help");
});
