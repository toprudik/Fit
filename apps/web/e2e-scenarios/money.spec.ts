import { collectErrors, expectAccessible } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import { pickDate } from "./support/date-field";
import { addPackage, moscowDay, recordPastSessions, rub, ruDay, sellPass } from "./support/money";
import { ok } from "./support/personas";
import type { Locator } from "@playwright/test";

/** A click that lands before hydration does nothing, so click until the sheet is open. */
async function openSheet(button: Locator, sheet: Locator) {
  await expect(async () => {
    if (!(await sheet.isVisible())) await button.click();
    await expect(sheet).toBeVisible({ timeout: 2000 });
  }).toPass();
}

/*
 * Money (screens.md "Деньги", flow 4.5, PRD wave-1 §2.8): packages and the price grid, marking a payment that
 * sells a pass and pays off the debt, correcting a payment, the client's passes and a pass's new last day.
 */

test.describe("Money tab", () => {
  test("a trainer without payments sees the month empty and every segment's empty state", async ({ trainer }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/money");
    await expect(page.getByRole("heading", { level: 1, name: "Деньги" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Поступило в этом месяце" })).toBeVisible();
    await expect(page.getByText("В этом месяце оплат ещё не было")).toBeVisible();
    // No debts, so the tab opens on payments.
    await expect(page.getByText("Оплат пока нет")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("radio", { name: "Долги" }).click();
    await expect(page.getByText("Долгов нет")).toBeVisible();
    await page.getByRole("radio", { name: "Абонементы" }).click();
    await expect(page.getByText("Абонементы ни у кого не заканчиваются")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: /Пакеты и цены/ }).click();
    await expect(page).toHaveURL(/\/trainer\/money\/packages$/);
    expect(errors()).toEqual([]);
  });

  test("debts, payments and passes that run out are listed across clients", async ({ trainer, client }) => {
    await sellPass(trainer, client.coachingId, { title: "Пакет на 2", sessions: 2, priceMajor: 4000, paid: true });
    await recordPastSessions(trainer, client.coachingId, 3);
    const { page } = trainer;
    await page.goto("/trainer/money");
    // One session is a debt now, so the tab opens on debts.
    const debts = page.getByRole("region", { name: "Долги" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Долги" }) }));
    await expect(debts.getByRole("link", { name: /Анна/ })).toContainText("1 занятие");
    await expect(page.getByText(rub(4000)).first()).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("radio", { name: "Оплаты" }).click();
    await expect(page.getByText("Последние оплаты")).toBeVisible();
    const payment = page.getByRole("link", { name: /Анна/ });
    await expect(payment).toContainText(rub(4000));
    await expect(payment).toContainText("Пакет на 2");
    await expect(payment).toContainText("Подтверждена");

    await page.getByRole("radio", { name: "Абонементы" }).click();
    await expect(page.getByText("Абонементы ни у кого не заканчиваются")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("radio", { name: "Долги" }).click();
    await page.getByRole("link", { name: /Анна/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trainer/clients/${client.coachingId}/payments$`));
  });

  test("a pass not paid in full is listed apart from debts, with what is left to pay (QA T9)", async ({ trainer, client }) => {
    await sellPass(trainer, client.coachingId, { title: "Пакет на 5", sessions: 5, priceMajor: 9000 });
    const { page } = trainer;
    await page.goto("/trainer/money");
    // Nothing is owed in sessions, but the pass waits for 9 000 ₽, so the tab opens on debts.
    const unpaid = page.locator("section", { has: page.getByRole("heading", { name: "Не доплачено за абонементы" }) });
    const row = unpaid.getByRole("link", { name: /Анна/ });
    await expect(row).toContainText("Пакет на 5");
    await expect(row).toContainText(rub(9000));
    await expect(page.getByText("Долгов нет")).toHaveCount(0);
    await expectAccessible(page);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/trainer/clients/${client.coachingId}/payments$`));
    const left = page.locator("div", { has: page.locator("span", { hasText: "Не доплачено за абонементы" }) }).last();
    await expect(left).toContainText(rub(9000));

    // The client card says the same next to "Долг", which stays "Долга нет" (Q22).
    await page.goto(`/trainer/clients/${client.coachingId}`);
    const owed = page.getByRole("link", { name: /Не доплачено за абонементы/ });
    await expect(owed).toContainText(rub(9000));
    await expectAccessible(page);
    await client.page.goto(`/client/trainers/${client.coachingId}`);
    await expect(client.page.getByText("Не доплачено за абонементы")).toBeVisible();
  });
});

test.describe("Packages and the price grid", () => {
  test("a trainer builds the grid from the template: packs follow the drop-in price", async ({ trainer }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/money/packages");
    await expect(page.getByRole("heading", { level: 1, name: "Пакеты и цены" }).first()).toBeVisible();
    await expect(page.getByText("Пакетов пока нет")).toBeVisible();
    await expectAccessible(page);

    const template = page.locator("section", { has: page.getByRole("heading", { name: "Сетка из шаблона" }) });
    await template.getByLabel("Цена разового занятия").fill("2000");
    // Packs follow the drop-in price until typed: 10/20/25 % off.
    await expect(template.getByLabel("Пакет на 5 занятий")).toHaveValue("9000");
    await expect(template.getByLabel("Пакет на 10 занятий")).toHaveValue("16000");
    await expect(template.getByLabel("Пакет на 20 занятий")).toHaveValue("30000");
    await expect(template.getByText("Выгоднее всего")).toBeVisible();
    await template.getByLabel("Пакет на 20 занятий").fill("");
    await template.getByLabel("Срок действия").selectOption({ label: "90 дней" });
    await template.getByRole("button", { name: "Создать сетку" }).click();

    const grid = page.locator("section", { has: page.getByRole("heading", { name: "Как видят клиенты" }) });
    await expect(grid.getByText("Выгоднее всего")).toBeVisible();
    const all = page.locator("section", { has: page.getByRole("heading", { name: "Все пакеты" }) });
    await expect(all.getByRole("heading", { level: 3 })).toHaveText(["Разовое занятие", "5 занятий", "10 занятий"]);
    await expect(all.getByText(rub(16000))).toBeVisible();
    await expect(all.getByRole("listitem").filter({ hasText: "10 занятий" })).toContainText("90 дней");
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });

  test("creating the grid from the template confirms it with a toast", async ({ trainer }) => {
    const { page } = trainer;
    await page.goto("/trainer/money/packages");
    await page.getByLabel("Цена разового занятия").fill("2000");
    await page.getByRole("button", { name: "Создать сетку" }).click();
    await expect(page.getByRole("heading", { name: "Все пакеты" })).toBeVisible();
    await expect(page.getByText("Сетка готова")).toBeVisible();
  });

  test("an empty template is refused with a hint, and the packs still follow the price typed after it", async ({ trainer }) => {
    const { page } = trainer;
    await page.goto("/trainer/money/packages");
    const template = page.locator("section", { has: page.getByRole("heading", { name: "Сетка из шаблона" }) });
    await template.getByRole("button", { name: "Создать сетку" }).click();
    await expect(template.getByText("Укажи цену, например 2000")).toBeVisible();
    await expectAccessible(page);
    await template.getByLabel("Цена разового занятия").fill("2000");
    await expect(template.getByLabel("Пакет на 5 занятий")).toHaveValue("9000");
  });

  test("a trainer adds, edits and removes a package, with the form checking its fields", async ({ trainer }) => {
    await addPackage(trainer, { title: "Разовое занятие", sessions: 1, priceMajor: 2500 });
    const { page } = trainer;
    await page.goto("/trainer/money/packages");
    const sheet = page.getByRole("dialog", { name: "Новый пакет" });
    await openSheet(page.getByRole("button", { name: "Добавить пакет" }), sheet);
    await sheet.getByLabel("Сколько занятий").fill("0");
    await sheet.getByLabel("Цена за весь пакет").fill("дорого");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByText("От 1 до 200 занятий")).toBeVisible();
    await expect(sheet.getByText("Цена должна быть числом, например 9000")).toBeVisible();
    await expectAccessible(page);

    await sheet.getByLabel("Название").fill("Утренний блок");
    await sheet.getByLabel("Сколько занятий").fill("8");
    await sheet.getByLabel("Цена за весь пакет").fill("16000");
    await sheet.getByLabel("Срок действия").selectOption({ label: "60 дней" });
    await sheet.getByRole("radio", { name: "Персональные" }).click();
    await sheet.getByRole("switch", { name: "Показывать на витрине" }).click();
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Пакет сохранён")).toBeVisible();
    await expect(sheet).toBeHidden();

    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Утренний блок" }) });
    await expect(card).toContainText(rub(16000));
    await expect(card).toContainText("8 занятий");
    await expect(card).toContainText("Персональные");
    await expect(card).toContainText("60 дней");
    await expect(card.getByText("Скрыт с витрины")).toBeVisible();
    // A hidden package stays out of the grid clients see.
    const grid = page.locator("section", { has: page.getByRole("heading", { name: "Как видят клиенты" }) });
    await expect(grid).not.toContainText("Утренний блок");

    await card.getByRole("button", { name: "Изменить" }).click();
    const edit = page.getByRole("dialog", { name: "Изменить пакет" });
    await expect(edit.getByText("Новая цена не меняет абонементы, которые уже выданы.")).toBeVisible();
    await expect(edit.getByLabel("Цена за весь пакет")).toHaveValue("16000");
    await edit.getByLabel("Цена за весь пакет").fill("14400");
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await expect(edit).toBeHidden();
    await expect(card).toContainText(rub(14400));

    await card.getByRole("button", { name: "Убрать" }).click();
    const confirm = page.getByRole("dialog", { name: "Убрать пакет?" });
    await expect(confirm).toContainText("Абонементы, которые клиенты уже получили, останутся как есть.");
    await expectAccessible(page);
    await confirm.getByRole("button", { name: "Убрать" }).click();
    await expect(page.getByText("Пакет убран")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Утренний блок" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "Разовое занятие" })).toBeVisible();
  });

  test("a second drop-in package for the same kind of sessions is refused", async ({ trainer }) => {
    await addPackage(trainer, { title: "Разовое занятие", sessions: 1, priceMajor: 2500 });
    const { page } = trainer;
    await page.goto("/trainer/money/packages");
    const sheet = page.getByRole("dialog", { name: "Новый пакет" });
    await openSheet(page.getByRole("button", { name: "Добавить пакет" }), sheet);
    await sheet.getByLabel("Сколько занятий").fill("1");
    await sheet.getByLabel("Цена за весь пакет").fill("3000");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("Разовое занятие для такого вида занятий уже есть. Измени его или убери.");
  });
});

test.describe("Marking a payment", () => {
  test("a package payment sells a pass, pays off the debt first and shows the rest", async ({ trainer, client }) => {
    await addPackage(trainer, { title: "Разовое занятие", sessions: 1, priceMajor: 2000 });
    await addPackage(trainer, { title: "10 занятий", sessions: 10, priceMajor: 18000, validityDays: 90 });
    await recordPastSessions(trainer, client.coachingId, 2);

    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto(`/trainer/clients/${client.coachingId}`);
    const debtRow = page.getByRole("link", { name: /^Долг/ });
    await expect(debtRow).toContainText("2 занятия");
    await debtRow.click();
    await expect(page).toHaveURL(new RegExp(`/trainer/clients/${client.coachingId}/payments$`));
    await expect(page.getByText(/^2 занятия, /)).toContainText(rub(4000));
    await expect(page.getByText("Оплат пока нет")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Отметить оплату" }).click();
    const sheet = page.getByRole("dialog", { name: "Отметить оплату" });
    await expect(sheet.getByRole("radio", { name: "Новый абонемент" })).toBeChecked();
    await sheet.locator("label", { hasText: "10 занятий" }).click();
    await expect(sheet.getByRole("radio", { name: /10 занятий/ })).toBeChecked();
    // The amount comes from the package; the pass is paid with it.
    await expect(sheet.getByRole("switch", { name: "Оплата получена" })).toBeChecked();
    await expect(sheet.getByLabel("Сумма")).toHaveValue("18000");
    await sheet.getByRole("radio", { name: "Наличные" }).click();
    await expect(sheet.getByText("Абонемент на 10 занятий. Сначала из него погасится долг: 2 занятия.")).toBeVisible();
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Оформить" }).click();

    await expect(page.getByText("Абонемент оформлен, погашен долг: 2 занятия")).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Долга нет")).toBeVisible();
    const payment = page.getByRole("listitem").filter({ hasText: "Наличные" });
    await expect(payment).toContainText(rub(18000));
    await expect(payment).toContainText("10 занятий");
    await expect(payment).toContainText("Подтверждена");

    await page.getByRole("link", { name: "Абонементы", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/trainer/clients/${client.coachingId}/passes$`));
    const pass = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "10 занятий" }) });
    await expect(pass).toContainText("Действует");
    await expect(pass).toContainText("Оплачен");
    await expect(pass).toContainText("Осталось 8 из 10");
    await expect(page.getByText("Погашен долг за занятие")).toHaveCount(2);
    await expectAccessible(page);

    await page.goto("/trainer/money");
    await expect(page.getByText(rub(18000)).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Анна/ })).toContainText("Наличные");
    expect(errors()).toEqual([]);
  });

  test("the bot's link opens the sheet at once and a payment without a pass settles nothing", async ({ trainer, client }) => {
    await addPackage(trainer, { title: "Разовое занятие", sessions: 1, priceMajor: 2000 });
    await recordPastSessions(trainer, client.coachingId, 1);
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}/payments?action=new`);
    const sheet = page.getByRole("dialog", { name: "Отметить оплату" });
    await expect(sheet).toBeVisible();
    await sheet.locator("label", { hasText: "Без абонемента" }).click();
    await expect(sheet.getByRole("radio", { name: "Без абонемента" })).toBeChecked();
    await sheet.getByRole("button", { name: "Отметить оплату" }).click();
    await expect(sheet.getByText("Укажи сумму, например 9000")).toBeVisible();
    await expectAccessible(page);

    await sheet.getByLabel("Сумма").fill("2000");
    await sheet.getByRole("radio", { name: "Перевод" }).click();
    await sheet.getByRole("button", { name: "Отметить оплату" }).click();
    await expect(page.getByText("Оплата отмечена")).toBeVisible();
    const payment = page.getByRole("listitem").filter({ hasText: "Перевод" });
    await expect(payment).toContainText("Без абонемента");
    await expect(payment).toContainText(rub(2000));
    await expect(page.getByText(/^1 занятие, /)).toBeVisible();
  });

  test("the payments tab, where \"Долг\" leads, shows the debt with its amount and forgives it (QA U5)", async ({ trainer, client }) => {
    await addPackage(trainer, { title: "Разовое занятие", sessions: 1, priceMajor: 2000 });
    await recordPastSessions(trainer, client.coachingId, 1);
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}/payments`);
    await expect(page.getByText(/^1 занятие, /)).toContainText(rub(2000));
    const debt = page.locator("section", { has: page.getByRole("heading", { name: "Долг" }) });
    await expect(debt.getByRole("listitem")).toHaveCount(1);
    await expectAccessible(page);
    const sheet = page.getByRole("dialog", { name: "Простить списание?" });
    await openSheet(debt.getByRole("button", { name: "Простить" }), sheet);
    await sheet.getByRole("button", { name: "Простить" }).click();
    await expect(page.getByText("Списание прощено")).toBeVisible();
    await expect(page.getByText("Долга нет")).toBeVisible();
    await expect(debt).toHaveCount(0);
  });

  test("a trainer corrects a payment: the old one stays voided with the reason", async ({ trainer, client }) => {
    await sellPass(trainer, client.coachingId, { title: "Абонемент на 8", sessions: 8, priceMajor: 12000, paid: true });
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}/payments`);
    const payment = page.getByRole("listitem").filter({ hasText: rub(12000) });
    await payment.getByRole("button", { name: "Исправить" }).click();
    const sheet = page.getByRole("dialog", { name: "Исправить оплату" });
    await expect(sheet.getByLabel("Сумма")).toHaveValue("12000");
    await sheet.getByLabel("Сумма").fill("11000");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByText("Напиши, что исправили")).toBeVisible();
    await expectAccessible(page);

    await sheet.getByLabel("Что исправили").fill("Скидка за друга");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Оплата исправлена")).toBeVisible();
    const voided = page.getByRole("listitem").filter({ hasText: "Аннулирована" });
    await expect(voided).toContainText(rub(12000));
    await expect(voided).toContainText("Причина: Скидка за друга");
    const fresh = page.getByRole("listitem").filter({ hasText: "Подтверждена" });
    await expect(fresh).toContainText(rub(11000));

    await page.getByRole("link", { name: "Абонементы", exact: true }).click();
    await expect(page.getByRole("article")).toContainText("Оплачен частично");
    await expect(page.getByText("Оплата изменена").or(page.getByText("Оплата отменена")).first()).toBeVisible();
  });

  test("a client's 'Я оплатил' waits for the trainer, who confirms it", async ({ trainer, client }) => {
    const passId = await sellPass(trainer, client.coachingId, { title: "Абонемент на 5", sessions: 5, priceMajor: 9000 });
    await client.page.goto(`/client/passes/${passId}`);
    await expect(client.page.getByRole("heading", { name: "Оплатить" })).toBeVisible();
    await expect(client.page.getByText("Тренер пока не добавил ссылку на оплату. Спроси, как ему удобнее.")).toBeVisible();
    await client.page.getByRole("button", { name: "Я оплатил" }).click();
    const sheet = client.page.getByRole("dialog", { name: "Сообщить об оплате" });
    await expect(sheet.getByLabel("Сумма")).toHaveValue("9000");
    await expectAccessible(client.page);
    await sheet.getByRole("button", { name: "Я оплатил" }).click();
    await expect(client.page.getByText("Тренер получит сообщение", { exact: true })).toBeVisible();
    await expect(client.page.getByRole("listitem").filter({ hasText: "Ждёт подтверждения" })).toBeVisible();
    // A second «Я оплатил» waits for the first one (QA B1), and the history does not call the report a payment (B11).
    await client.page.reload();
    await expect(client.page.getByText(/^Ты уже сообщил об оплате/)).toBeVisible();
    await expect(client.page.getByRole("button", { name: "Я оплатил" })).toHaveCount(0);
    await expect(client.page.getByText("Сообщение об оплате", { exact: true })).toBeVisible();
    await expect(client.page.getByText("Внесена оплата", { exact: true })).toHaveCount(0);

    const { page } = trainer;
    await page.goto("/trainer/money");
    await page.getByRole("radio", { name: "Оплаты" }).click();
    await expect(page.getByText("Ждут подтверждения")).toBeVisible();
    await page.goto(`/trainer/clients/${client.coachingId}/payments`);
    const reported = page.getByRole("listitem").filter({ hasText: "Клиент сообщил об оплате" });
    await reported.getByRole("button", { name: "Подтвердить", exact: true }).click();
    await expect(page.getByText("Оплата подтверждена")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: rub(9000) })).toContainText("Подтверждена");

    await client.page.reload();
    await expect(client.page.getByRole("heading", { name: "Оплатить" })).toHaveCount(0);
    await expect(client.page.getByText("Оплачен", { exact: true })).toBeVisible();
  });
});

test.describe("Passes", () => {
  test("signed out, the client home and passes ask to sign in instead of looking empty (QA B10)", async ({ page }) => {
    await page.goto("/client/passes");
    await expect(page.getByRole("heading", { name: "Нужно войти" })).toBeVisible();
    await expect(page.getByText("Абонементов нет")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute("href", `/login?next=${encodeURIComponent("/client/passes")}`);
    await expectAccessible(page);
    await page.goto("/client");
    await expect(page.getByText("Войди через Telegram, и здесь появятся твои занятия и абонементы.")).toBeVisible();
    await expect(page.getByText("Ближайших занятий нет")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Войти через Telegram" })).toHaveAttribute("href", `/login?next=${encodeURIComponent("/client")}`);
  });

  test("a client without passes is told to ask the trainer", async ({ client }) => {
    await client.page.goto("/client/passes");
    await expect(client.page.getByText("Абонементов нет")).toBeVisible();
    await expect(client.page.getByText("Спроси тренера о пакетах.", { exact: false })).toBeVisible();
    await expectAccessible(client.page);
  });

  test("a client sees each pass with its debt, then the pass with the ring, payments and history", async ({ trainer, client }) => {
    const passId = await sellPass(trainer, client.coachingId, { title: "Абонемент на 3", sessions: 3, priceMajor: 6000, paid: true });
    await recordPastSessions(trainer, client.coachingId, 4);

    const { page } = client;
    const errors = collectErrors(page);
    await page.goto("/client/passes");
    await expect(page.getByRole("heading", { level: 2, name: /Тренер Иван/ })).toBeVisible();
    await expect(page.getByText(/^Долг: 1 занятие/)).toBeVisible();
    // The card is a link around an <article>: it gets no accessible name of its own, so find it by its heading.
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Абонемент на 3" }) }).getByRole("link");
    await expect(card).toContainText("Закончился");
    await expect(card).toContainText("Осталось 0 из 3");
    await expectAccessible(page);

    await card.click();
    await expect(page).toHaveURL(new RegExp(`/client/passes/${passId}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Абонемент на 3" }).first()).toBeVisible();
    await expect(page.getByText("Осталось занятий")).toBeVisible();
    await expect(page.getByRole("region", { name: "Оплаты" }).getByRole("listitem")).toContainText("Подтверждена");
    const history = page.locator("section", { has: page.getByRole("heading", { name: "История" }) });
    await expect(history.getByText("Занятие проведено")).toHaveCount(3);
    const changes = page.locator("section", { has: page.getByRole("heading", { name: "Изменения" }) });
    await expect(changes.getByText("Абонемент оформлен")).toBeVisible();
    await expect(changes.getByText("Внесена оплата")).toBeVisible();
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });

  test("a trainer moves a pass's last day, the client sees the new date", async ({ trainer, client }) => {
    const passId = await sellPass(trainer, client.coachingId, { title: "Абонемент на 10", sessions: 10, priceMajor: 15000, validityDays: 30, startsOn: moscowDay(-2) });
    const lastDay = moscowDay(45);
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}/passes`);
    const pass = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Абонемент на 10" }) });
    await expect(pass).toContainText("Не оплачен");
    await pass.getByRole("button", { name: "Изменить срок" }).click();
    const sheet = page.getByRole("dialog", { name: "Изменить срок" });
    // The calendar starts at the pass's first day, so a last day before it can't be picked.
    await pickDate(page, sheet, "Последний день", lastDay);
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByText("Напиши причину")).toBeVisible();
    await sheet.getByLabel("Причина").fill("Болел две недели");
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Срок изменён")).toBeVisible();
    await expect(pass).toContainText(`Действует по ${ruDay(lastDay)}`);
    await expect(page.getByText("Абонемент изменён").first()).toBeVisible();

    await client.page.goto(`/client/passes/${passId}`);
    await expect(client.page.getByText(`Действует по ${ruDay(lastDay)}`)).toBeVisible();
    await expect(client.page.getByText(`срок был до ${ruDay(moscowDay(27))}, теперь до ${ruDay(lastDay)}`)).toBeVisible();
    await expectAccessible(client.page);
  });

  test("the reason for a new last day reaches the client, as the form says", async ({ trainer, client }) => {
    const passId = await sellPass(trainer, client.coachingId, { title: "Абонемент на 10", sessions: 10, priceMajor: 15000, validityDays: 30 });
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}/passes`);
    await page.getByRole("button", { name: "Изменить срок" }).click();
    const sheet = page.getByRole("dialog", { name: "Изменить срок" });
    await expect(sheet.getByText("Клиент увидит её в истории абонемента. Например: болел две недели")).toBeVisible();
    await pickDate(page, sheet, "Последний день", moscowDay(60));
    await sheet.getByLabel("Причина").fill("Болел две недели");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Срок изменён")).toBeVisible();

    await client.page.goto(`/client/passes/${passId}`);
    await expect(client.page.getByText(`Действует по ${ruDay(moscowDay(60))}`)).toBeVisible();
    await expect(client.page.getByText("Болел две недели")).toBeVisible();
  });

  test("a trainer freezes a pass for today and unfreezes it the same day (QA U8)", async ({ trainer, client }) => {
    await sellPass(trainer, client.coachingId, { title: "Абонемент на 8", sessions: 8, priceMajor: 12000, validityDays: 30 });
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}/passes`);
    const pass = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Абонемент на 8" }) });
    const sheet = page.getByRole("dialog", { name: "Заморозить абонемент" });
    await openSheet(pass.getByRole("button", { name: "Заморозить" }), sheet);
    await sheet.getByRole("button", { name: "Заморозить" }).click();
    await expect(page.getByText("Абонемент заморожен")).toBeVisible();
    await expect(pass.getByText("Идёт сейчас")).toBeVisible();
    await expectAccessible(page);

    await pass.getByRole("button", { name: "Разморозить" }).click();
    await expect(page.getByText("Заморозка снята").first()).toBeVisible();
    await expect(pass.getByText("Идёт сейчас")).toHaveCount(0);
    await expect(pass.getByRole("button", { name: "Разморозить" })).toHaveCount(0);
  });

  test("a pass that cannot be found is a not-found page for the client", async ({ trainer, client, persona }) => {
    const passId = await sellPass(trainer, client.coachingId, { title: "Чужой абонемент", sessions: 2, priceMajor: 3000 });
    const stranger = await persona({ firstName: "Пётр" });
    await stranger.page.goto(`/client/passes/${passId}`);
    await expect(stranger.page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    await expect(stranger.page.getByText("Чужой абонемент")).toHaveCount(0);
    // The pass is still there for its owner.
    ok(await client.db.from("passes").select("id").eq("id", passId).single(), "own pass");
  });
});
