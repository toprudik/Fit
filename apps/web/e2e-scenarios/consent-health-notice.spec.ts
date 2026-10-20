import { collectErrors, expectAccessible } from "../e2e/support";
import { ok } from "./support/personas";
import { expect, test } from "./support/fixtures";

test("the health data consent shows the health notice first, then the consent after «Понятно»", async ({ client }) => {
  test.slow();
  const { page, context, db, userId } = client;
  const errors = collectErrors(page);
  ok(await db.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "pd_health"), "revoke");
  await context.clearCookies({ name: "dafit-health-notice" });

  await page.goto("/onboarding/consent?step=health&next=%2Fclient%2Fprogress");
  await expect(page.getByRole("heading", { level: 2, name: "Сначала о здоровье" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Даю согласие" })).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole("button", { name: "Понятно" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Данные о здоровье" })).toBeVisible();
  await page.getByRole("button", { name: "Даю согласие" }).click();
  await expect(page).toHaveURL(/\/client\/progress$/);
  expect(errors()).toEqual([]);
});
