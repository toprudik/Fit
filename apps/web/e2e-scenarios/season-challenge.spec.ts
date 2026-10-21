import { collectErrors, expectAccessible } from "../e2e/support";
import { expectToast, namedAdmin, uniqueLastName } from "./support/admin";
import { expect, test } from "./support/fixtures";

test.describe("DaFit season challenge (marketing 12)", () => {
  test.slow();

  test("the admin starts it, a client joins and leaves on «Прогресс», the admin cancels it", async ({ persona, client }, testInfo) => {
    // One challenge a month across the run and the client sees the earliest one: on both projects at once the two
    // runs would share it, so this one runs on the desktop project only.
    test.skip(testInfo.project.name === "phone", "one season challenge at a time");
    const admin = await namedAdmin(persona);
    const title = `Месяц ${uniqueLastName("без пропусков")}`.slice(0, 80);
    // A far month of its own: one challenge a month across the whole run.
    const month = `${2100 + (Date.now() % 7000)}-0${1 + (Date.now() % 9)}`;
    const adminErrors = collectErrors(admin.page);

    await admin.page.goto("/admin/season-challenges");
    await expect(admin.page.getByRole("heading", { level: 1, name: "Челленджи DaFit" })).toBeVisible();
    await expectAccessible(admin.page);
    await admin.page.getByLabel("Название").fill(title);
    await admin.page.getByLabel("Месяц").fill(month);
    await admin.page.getByRole("button", { name: "Запустить" }).click();
    await expectToast(admin.page, "Челлендж запущен");
    const row = admin.page.getByRole("listitem").filter({ hasText: title });
    await expect(row).toContainText("участников: 0, прошли: 0");

    const { page } = client;
    const errors = collectErrors(page);
    await page.goto("/client/progress");
    const card = page.getByRole("region", { name: title });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Участвовать" }).click();
    await expect(card.getByText(/^Посещено: 0, пропусков: 0/)).toBeVisible();
    await expectAccessible(page);
    await card.getByRole("button", { name: "Выйти из челленджа" }).click();
    await expect(card.getByRole("button", { name: "Участвовать" })).toBeVisible();
    expect(errors()).toEqual([]);

    await row.getByRole("button", { name: "Отменить" }).click();
    await expectToast(admin.page, "Челлендж отменён");
    await expect(row).toContainText("Отменён");
    expect(adminErrors()).toEqual([]);
  });
});
