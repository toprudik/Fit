import { collectErrors, expectAccessible } from "../e2e/support";
import { expect, test } from "./support/fixtures";

test.describe("«Мои вехи» of a trainer (marketing 14)", () => {
  test("opens from «Ещё», shows the way to the next milestones and has its switch in notifications", async ({ trainer, client }) => {
    const { page } = trainer;
    expect(client.coachingId).toBeTruthy();
    const errors = collectErrors(page);

    await page.goto("/trainer/more");
    await page.getByRole("link", { name: /Мои вехи/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Мои вехи" })).toBeVisible();
    await expect(page.getByText("Впереди")).toBeVisible();
    await expect(page.getByText("Пять клиентов", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 из 5$/)).toBeVisible();
    await expect(page.getByText(/0 из 100$/)).toBeVisible();
    await expect(page.getByText("Достигнуто")).toHaveCount(0);
    await expectAccessible(page);

    await page.goto("/settings/notifications");
    await expect(page.getByRole("switch", { name: "Мои вехи" })).toBeChecked();
    expect(errors()).toEqual([]);
  });
});
