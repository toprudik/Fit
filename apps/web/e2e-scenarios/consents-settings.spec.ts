import { collectErrors, expectAccessible } from "../e2e/support";
import { expect, test } from "./support/fixtures";

test.describe("consents in the settings", () => {
  test.slow();

  test("a client sees the consents with dates, withdraws the health data one and gives it again", async ({ client }) => {
    const { page } = client;
    const errors = collectErrors(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "Согласия" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Согласия" })).toBeVisible();
    await expect(page.getByText("Обработка персональных данных")).toBeVisible();
    await expect(page.getByText(/^Дано /)).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Удалить аккаунт" })).toHaveAttribute("href", "/settings/delete");
    await expectAccessible(page);

    // The first tap asks; "Оставить" changes nothing.
    await page.getByRole("button", { name: "Отозвать согласие" }).click();
    await page.getByRole("button", { name: "Оставить" }).click();
    await expect(page.getByText(/^Дано /)).toHaveCount(3);

    await page.getByRole("button", { name: "Отозвать согласие" }).click();
    await expect(page.getByText(/Отозвать согласие на данные о здоровье\?/)).toBeVisible();
    await page.getByRole("button", { name: "Отозвать", exact: true }).click();
    await expect(page.getByText("Не дано")).toBeVisible();
    await expect(page.getByText(/^Дано /)).toHaveCount(2);
    // The required consents stay: the proxy still lets the person in.
    await page.goto("/client");
    await expect(page).toHaveURL(/\/client$/);

    await page.goto("/settings/consents");
    await page.getByRole("link", { name: "Дать согласие" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Данные о здоровье" })).toBeVisible();
    await page.getByRole("button", { name: "Даю согласие" }).click();
    await expect(page).toHaveURL(/\/settings\/consents$/);
    await expect(page.getByText(/^Дано /)).toHaveCount(3);
    expect(errors()).toEqual([]);
  });
});
