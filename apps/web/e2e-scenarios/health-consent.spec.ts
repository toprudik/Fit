import { collectErrors, expectAccessible } from "../e2e/support";
import { ok } from "./support/personas";
import { expect, test } from "./support/fixtures";

test.describe("health sections behind the health data consent", () => {
  test.slow();

  test("without the consent measurements ask for it, and open once it is given", async ({ client }) => {
    const { page, db, userId } = client;
    const errors = collectErrors(page);
    ok(await db.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "pd_health"), "revoke");

    await page.goto("/client");
    await expect(page.getByRole("link", { name: /Нужно согласие на данные о здоровье/ })).toBeVisible();
    await expect(page.getByLabel("Вес сегодня")).toHaveCount(0);
    await expectAccessible(page);

    await page.goto("/client/progress");
    await expect(page.getByRole("heading", { level: 2, name: "Нужно согласие на данные о здоровье" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Замеры" })).toHaveCount(0);
    await expectAccessible(page);

    await page.goto("/client/diary/food/target");
    await expect(page.getByRole("heading", { level: 1, name: "Питание" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Нужно согласие на данные о здоровье" })).toBeVisible();

    await page.goto("/client/progress/measurements");
    await expect(page.getByRole("heading", { level: 1, name: "Замеры" })).toBeVisible();
    await page.getByRole("link", { name: "Дать согласие" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Данные о здоровье" })).toBeVisible();
    await page.getByRole("button", { name: "Даю согласие" }).click();
    await expect(page).toHaveURL(/\/client\/progress\/measurements$/);
    await expect(page.getByRole("heading", { name: "Нужно согласие на данные о здоровье" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Добавить замер" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("without the consent steps and sleep, own workouts and the intake ask for it", async ({ client }) => {
    const { page, db, userId } = client;
    const errors = collectErrors(page);
    ok(await db.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", "pd_health"), "revoke");

    await page.goto("/client/diary");
    await expect(page.getByRole("heading", { level: 2, name: "Нужно согласие на данные о здоровье" })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/client/diary/activity");
    await expect(page.getByRole("heading", { level: 1, name: "Активность" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Нужно согласие на данные о здоровье" })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/client/diary/workouts/new");
    await expect(page.getByRole("heading", { level: 1, name: "Новая тренировка" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Дать согласие" })).toHaveAttribute("href", /next=%2Fclient%2Fdiary%2Fworkouts%2Fnew/);
    expect(errors()).toEqual([]);
  });

  test("the nutrition target shows the health notice first, then the calculator after «Понятно»", async ({ client }) => {
    const { page, context } = client;
    const errors = collectErrors(page);
    await context.clearCookies({ name: "dafit-health-notice" });

    await page.goto("/client/diary/food/target");
    await expect(page.getByRole("heading", { level: 2, name: "Сначала о здоровье" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Рассчитать" })).toHaveCount(0);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Понятно" }).click();
    await expect(page.getByRole("button", { name: "Рассчитать" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Сначала о здоровье" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "О здоровье" })).toHaveAttribute("href", "/legal/health");
    expect(errors()).toEqual([]);
  });
});
