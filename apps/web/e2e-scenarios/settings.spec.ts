import type { Page } from "@playwright/test";
import { collectErrors, expectAccessible } from "../e2e/support";
import { expectToast, namedAdmin } from "./support/admin";
import { expect, test } from "./support/fixtures";
import { ok } from "./support/personas";

/** A 1×1 PNG, a valid screenshot for the feedback form. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

/** Runs the action and waits for the server action it fires (the switches save without a toast). */
async function saved(page: Page, action: () => Promise<void>) {
  const answer = page.waitForResponse((response) => response.request().method() === "POST" && response.request().headers()["next-action"] !== undefined);
  await action();
  expect((await answer).ok()).toBe(true);
}

test.describe("account settings", () => {
  test.slow();

  test("the profile lists the person and the way to settings, plan, feedback and, for admins, the admin section", async ({ client, persona }) => {
    const { page } = client;
    const errors = collectErrors(page);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Профиль" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Анна Клиентова").first()).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Настройки" })).toHaveAttribute("href", "/settings");
    await expect(page.getByRole("main").getByRole("link", { name: "Мой тариф" })).toHaveAttribute("href", "/settings/plan");
    await expect(page.getByRole("main").getByRole("link", { name: "Обратная связь" })).toHaveAttribute("href", /\/feedback/);
    await expect(page.getByRole("main").getByRole("link", { name: "У меня есть инвайт тренера" })).toHaveAttribute("href", "/onboarding/trainer");
    await expect(page.getByRole("main").getByRole("link", { name: "Админка" })).toHaveCount(0);
    await expectAccessible(page);
    await page.getByRole("main").getByRole("link", { name: "Настройки" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
    expect(errors()).toEqual([]);

    const admin = await namedAdmin(persona);
    await admin.page.goto("/profile");
    await expect(admin.page.getByRole("main").getByRole("link", { name: "Админка" })).toHaveAttribute("href", "/admin");
  });

  test("theme and language switch at once and stay after a reload and on the account", async ({ client }) => {
    const { page, db, userId } = client;
    // The suite signs in outside the page, so the sign-in's preference cookies sit unpartitioned next to the
    // partitioned ones the page writes, and the page reads the first. Drop them, as a Mini App sign-in never makes them.
    await page.context().clearCookies({ name: /^dafit-(theme|locale)$/ });
    const errors = collectErrors(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
    for (const link of ["Уведомления", "Календарь", "Лицензии", "Экспорт данных", "Удалить аккаунт"]) {
      await expect(page.getByRole("main").getByRole("link", { name: link })).toBeVisible();
    }
    await expectAccessible(page);

    await page.getByRole("radio", { name: "Тёмная" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectAccessible(page);
    await page.getByRole("radio", { name: "Светлая" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("radio", { name: "Светлая" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await db.from("user_settings").select("theme").eq("user_id", userId).single()).data?.theme).toBe("light");
    await expectAccessible(page);

    await page.getByRole("radio", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "English" })).toHaveAttribute("aria-checked", "true");
    await expect.poll(async () => (await db.from("user_settings").select("locale").eq("user_id", userId).single()).data?.locale).toBe("en");
    await page.goto("/client");
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/settings");
    await page.getByRole("radio", { name: "Русский" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Настройки" })).toBeVisible();
    await page.getByRole("radio", { name: "Авто" }).click();
    await expect(page.getByRole("radio", { name: "Авто" })).toHaveAttribute("aria-checked", "true");
    expect(errors()).toEqual([]);
  });

  test("notification settings save each switch and quiet hours, and they hold after a reload", async ({ client }) => {
    const { page } = client;
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { level: 1, name: "Уведомления" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Напоминания о занятиях" }).first()).toBeVisible();
    await expect(page.getByText("Иван Тренеров").first()).toBeVisible();
    await expectAccessible(page);

    const monthly = page.getByRole("switch", { name: "Итоги месяца" });
    await expect(monthly).toBeChecked();
    await saved(page, () => monthly.click());
    await expect(monthly).not.toBeChecked();

    // Quiet hours start on for a new account; turning them off hides the times, turning them on shows them.
    const quiet = page.getByRole("switch", { name: "Тихие часы" });
    await expect(quiet).toBeChecked();
    await expect(page.getByLabel("С", { exact: true })).toBeVisible();
    await saved(page, () => quiet.click());
    await expect(quiet).not.toBeChecked();
    await expect(page.getByLabel("С", { exact: true })).toHaveCount(0);
    await expectAccessible(page);

    await page.reload();
    await expect(page.getByRole("switch", { name: "Итоги месяца" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Тихие часы" })).not.toBeChecked();
    await saved(page, () => page.getByRole("switch", { name: "Тихие часы" }).click());
    await expect(page.getByLabel("До", { exact: true })).toBeVisible();
    await saved(page, () => page.getByRole("switch", { name: "Итоги месяца" }).click());
    await page.reload();
    await expect(page.getByRole("switch", { name: "Итоги месяца" })).toBeChecked();
  });

  test("a trainer's notification settings have the defaults for new clients and the morning digest", async ({ trainer }) => {
    const { page } = trainer;
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { name: "Напоминания новым клиентам" })).toBeVisible();
    await expect(page.getByLabel("Время утренней сводки")).toBeVisible();
    await expect(page.getByRole("switch", { name: "Утренняя сводка" })).toBeVisible();
    await expectAccessible(page);
  });

  test("calendar: a feed is connected, answers ICS, and a reissued link replaces the old one", async ({ client }) => {
    const { page } = client;
    await page.goto("/settings/calendar");
    await expect(page.getByRole("heading", { level: 1, name: "Календарь" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Мои занятия" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Подключить календарь" }).click();
    const link = page.getByTestId("calendar-feed-link");
    await expect(link).toBeVisible();
    const first = (await link.innerText()).trim();
    expect(first).toMatch(/^https?:\/\/.+\/api\/calendar\//);
    await expect(page.getByText("Сохрани ссылку сейчас, она показывается один раз.", { exact: false })).toBeVisible();
    await expectAccessible(page);

    const feedPath = (url: string) => new URL(url).pathname;
    const answer = await page.request.get(feedPath(first));
    expect(answer.status()).toBe(200);
    expect(answer.headers()["content-type"]).toContain("text/calendar");
    const ics = await answer.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("DaFit: мои занятия");

    await page.reload();
    await expect(page.getByText("Фид подключён").first()).toBeVisible();
    await expect(link).toHaveCount(0);
    await page.getByRole("button", { name: "Перевыпустить ссылку" }).click();
    const sheet = page.getByRole("dialog", { name: "Перевыпустить ссылку?" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Перевыпустить" }).click();
    await expect(link).toBeVisible();
    const second = (await link.innerText()).trim();
    expect(second).not.toBe(first);
    expect((await page.request.get(feedPath(first))).status()).toBe(404);
    expect((await page.request.get(feedPath(second))).status()).toBe(200);
  });

  test("export: a request shows up as queued", async ({ client }) => {
    const { page } = client;
    await page.goto("/settings/export");
    await expect(page.getByRole("heading", { level: 1, name: "Экспорт данных" })).toBeVisible();
    await expect(page.getByText("Экспортов ещё не было")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Запросить экспорт" }).click();
    await expectToast(page, "Запрос принят. Бот напишет, когда архив будет готов.");
    await expect(page.getByText("В очереди").first()).toBeVisible();
    await page.reload();
    await expect(page.getByText("В очереди").first()).toBeVisible();
    // Scoped to the screen: a streamed copy can sit hidden next to it for a moment after the reload.
    await expect(page.locator("#main").getByText(/Запрошен/)).toBeVisible();
    await expectAccessible(page);
  });

  test("delete: the typed word is checked, a requested deletion locks the app, and cancelling brings it back", async ({ client }) => {
    const { page } = client;
    await page.goto("/settings/delete");
    await expect(page.getByRole("heading", { level: 1, name: "Удаление аккаунта" })).toBeVisible();
    await expect(page.getByText("Тренеры получат сообщение: Иван Тренеров.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Экспорт данных" })).toHaveAttribute("href", "/settings/export");
    await expectAccessible(page);

    const confirm = page.getByRole("textbox", { name: "Чтобы подтвердить, напиши УДАЛИТЬ" });
    await confirm.fill("удалю");
    await page.getByRole("button", { name: "Удалить аккаунт" }).click();
    await expect(page.getByText("Напиши УДАЛИТЬ, как в подсказке")).toBeVisible();
    await confirm.fill("удалить");
    await page.getByRole("button", { name: "Удалить аккаунт" }).click();
    await expect(page.getByRole("heading", { name: /Аккаунт будет удалён/ })).toBeVisible();
    await expectAccessible(page);

    // While the deletion is pending, the zones lead back to this screen.
    await page.goto("/client");
    await expect(page).toHaveURL(/\/settings\/delete/);
    await expect(page.getByRole("heading", { name: /Аккаунт будет удалён/ })).toBeVisible();
    await page.goto("/settings/export");
    await expect(page.getByRole("heading", { level: 1, name: "Экспорт данных" })).toBeVisible();

    await page.goto("/settings/delete");
    await page.getByRole("button", { name: "Отменить удаление" }).click();
    await expectToast(page, "Удаление отменено");
    await page.goto("/client");
    await expect(page).toHaveURL(/\/client$/);
    await expect(page.getByRole("heading", { level: 1, name: "Главная" })).toBeVisible();
  });

  test("licenses name the data DaFit uses", async ({ client }) => {
    const { page } = client;
    await page.goto("/settings/licenses");
    await expect(page.getByRole("heading", { level: 1, name: "Лицензии" })).toBeVisible();
    await expect(page.getByText("Упражнения wger")).toBeVisible();
    await expect(page.getByRole("link", { name: "Сайт wger.de" })).toHaveAttribute("href", /wger\.de/);
    await expectAccessible(page);
  });

  test("feedback: screenshots are checked, a sent message thanks the user and the form can be used again", async ({ trainer }) => {
    const { page } = trainer;
    await page.goto("/trainer");
    await page.goto("/feedback?from=/trainer/schedule");
    const files = page.locator('#main input[type="file"]');
    await files.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("не картинка") });
    await expect(page.getByText("Подойдёт картинка PNG, JPG или WebP до 5 МБ")).toBeVisible();
    await files.setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: "Скриншот 1" })).toBeVisible();
    await page.getByRole("button", { name: "Убрать скриншот 1" }).click();
    await expect(page.getByRole("img", { name: "Скриншот 1" })).toHaveCount(0);
    await files.setInputFiles({ name: "screen.png", mimeType: "image/png", buffer: PNG });
    await expectAccessible(page);

    await page.getByRole("radio", { name: "Идея" }).click();
    await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveAttribute("placeholder", "Что хочется сделать и зачем");
    await page.getByRole("textbox", { name: "Сообщение" }).fill("Хочу видеть занятия на неделю одним списком");
    await page.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByRole("heading", { name: "Спасибо, получили" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Вернуться" })).toHaveAttribute("href", "/trainer/schedule");
    await page.getByRole("button", { name: "Написать ещё" }).click();
    await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveValue("");
  });

  test("contact request: the asked client sees who asks and declines outside Telegram; an unknown request is not found", async ({ trainer, client }) => {
    const requestId = ok(await trainer.db.rpc("request_contact", { p_coaching_id: client.coachingId }), "contact request");
    const { page } = client;
    await page.goto(`/contact/${requestId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Просьба связаться" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Тренер Иван Тренеров просит связаться" })).toBeVisible();
    await expect(page.getByText("Поделиться контактом можно только в Telegram: номер передаёт сам Telegram.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Открыть в Telegram" })).toHaveAttribute("href", /^https:\/\/t\.me\//);
    await expectAccessible(page);
    await page.getByRole("button", { name: "Отказаться" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Просьба отклонена. Иван Тренеров получит об этом сообщение в боте." })).toBeVisible();
    await page.reload();
    // Scoped to the screen: React's streamed copy (div#S:0 hidden) can linger next to it for a moment.
    await expect(page.locator("#main").getByText("Просьба отклонена.", { exact: false })).toBeVisible();

    // Only the asked person sees it.
    await trainer.page.goto(`/contact/${requestId}`);
    await expect(trainer.page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    await page.goto(`/contact/${crypto.randomUUID()}`);
    await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
  });
});
