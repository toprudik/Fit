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
    // A client has no showcase; story cards are asked for on the first card.
    await expect(page.getByText("Публикация витрины")).toHaveCount(0);
    await expect(page.getByText("Карточки для сторис")).toBeVisible();
    await expect(page.getByText("Не дано")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Удалить аккаунт" })).toHaveAttribute("href", "/settings/delete");
    await expectAccessible(page);

    // The first tap asks; "Оставить" changes nothing.
    await page.getByRole("button", { name: "Отозвать согласие" }).click();
    await page.getByRole("button", { name: "Оставить" }).click();
    await expect(page.getByText(/^Дано /)).toHaveCount(3);

    await page.getByRole("button", { name: "Отозвать согласие" }).click();
    await expect(page.getByText(/Отозвать согласие на данные о здоровье\?/)).toBeVisible();
    await page.getByRole("button", { name: "Отозвать", exact: true }).click();
    await expect(page.getByText("Не дано")).toHaveCount(2);
    await expect(page.getByText(/^Сведения о здоровье удалим /)).toBeVisible();
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

  test("a trainer turns the showcase on, then withdraws the consent to publish here and the showcase closes", async ({ trainer }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/settings/consents");
    await expect(page.getByText("Публикация витрины")).toBeVisible();
    await expect(page.getByRole("link", { name: "Включить витрину" })).toHaveAttribute("href", "/trainer/showcase");
    await page.goto("/trainer/showcase");
    await expect(page.getByRole("heading", { level: 1, name: "Витрина" })).toBeVisible();

    const slug = `consent-e2e-${trainer.telegramId}`.slice(0, 32);
    await page.getByLabel("Адрес витрины").fill(slug);
    await page.getByRole("button", { name: "Сохранить адрес" }).click();
    await expect(page.getByText("Адрес сохранён")).toBeVisible();
    // The toast sits over the button and stays while the pointer is on it.
    await expect(page.getByText("Адрес сохранён")).toBeHidden();
    await page.getByRole("button", { name: "Включить витрину" }).click();
    const consent = page.getByRole("dialog", { name: "Согласие на публикацию" });
    await consent.getByRole("checkbox", { name: "Описание, опыт и специализации" }).check();
    await consent.getByRole("button", { name: "Даю согласие" }).click();
    await expect(page.getByRole("button", { name: "Выключить витрину" })).toBeVisible();

    await page.goto("/settings/consents");
    await expect(page.getByRole("link", { name: "Включить витрину" })).toHaveCount(0);
    await expectAccessible(page);
    // The buttons go in the order of the rows: health data first, then the showcase (story cards are not given).
    await expect(page.getByRole("button", { name: "Отозвать согласие" })).toHaveCount(2);
    await page.getByRole("button", { name: "Отозвать согласие" }).nth(1).click();
    await expect(page.getByText(/Отозвать согласие на публикацию\?/)).toBeVisible();
    await page.getByRole("button", { name: "Отозвать", exact: true }).click();
    await expect(page.getByRole("link", { name: "Включить витрину" })).toBeVisible();

    await page.goto("/trainer/showcase");
    await expect(page.getByRole("button", { name: "Включить витрину" })).toBeVisible();
    await page.goto(`/trainers/${slug}`);
    await expect(page.getByText("Тренер недоступен")).toBeVisible();
    expect(errors()).toEqual([]);
  });
});
