import { collectErrors } from "../e2e/support";
import { expect, test } from "./support/fixtures";

test("data export and account deletion open before the consents are accepted", async ({ persona }) => {
  test.slow();
  const someone = await persona({ firstName: "Вера", consent: false });
  const { page } = someone;
  // The shell saves the device time zone through an API route, which stays closed until the consents (403).
  const errors = collectErrors(page, [/status of 403/]);

  await page.goto("/client");
  await expect(page).toHaveURL(/\/onboarding\/consent\?next=/);

  await page.goto("/settings/export");
  await expect(page).toHaveURL(/\/settings\/export$/);
  await expect(page.getByRole("heading", { level: 1, name: "Экспорт данных" })).toBeVisible();

  await page.goto("/settings/delete");
  await expect(page).toHaveURL(/\/settings\/delete$/);
  await expect(page.getByRole("heading", { level: 1, name: "Удаление аккаунта" })).toBeVisible();
  expect(errors()).toEqual([]);
});
