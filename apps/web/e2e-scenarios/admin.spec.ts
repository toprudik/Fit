import type { Page } from "@playwright/test";
import { collectErrors, expectAccessible } from "../e2e/support";
import { cardOf, expectToast, namedAdmin, namedTrainer, submitVerification, uniqueLastName } from "./support/admin";
import { expect, test } from "./support/fixtures";
import { ok, signedInitData } from "./support/personas";

/** An invite's row in /admin/invites: its note, status badge, code line and button. */
function inviteRow(page: Page, note: string, status: string) {
  return page.getByText(note, { exact: true }).locator("xpath=../..").filter({ hasText: status });
}

test.describe("admin section", () => {
  // Several people and many screens per scenario; the shared local server is slow under the full suite.
  test.slow();

  test("the overview shows the beta counts and leads to the sections", async ({ admin }, testInfo) => {
    const { page } = admin;
    const errors = collectErrors(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Обзор беты" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Сейчас в бете" })).toBeVisible();
    for (const label of ["Пользователи", "Тренеры", "Ждут верификации", "Верифицированы", "Действующие приглашения", "Активные пары", "Заблокированы"]) {
      await expect(page.getByRole("main").getByText(label, { exact: true }).first()).toBeVisible();
    }
    // A phone has no side menu: the overview lists the sections; a desktop has the menu.
    const sections = testInfo.project.name === "phone" ? page.getByRole("main") : page.getByRole("navigation", { name: "Разделы админки" });
    for (const name of ["Приглашения", "Верификация", "Тарифы", "Обратная связь", "Отзывы", "Аналитика", "Статистика", "Журнал действий"]) {
      await expect(sections.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expectAccessible(page);
    await sections.getByRole("link", { name: "Журнал действий", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Журнал действий" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a non-admin opening /admin gets the not-found page", async ({ trainer, client }) => {
    for (const { page } of [trainer, client]) {
      const answer = await page.goto("/admin");
      expect(answer?.status()).toBe(404);
      await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
      await expect(page.getByText("Обзор беты")).toHaveCount(0);
      await expectAccessible(page);
    }
    const subpage = await client.page.goto("/admin/users");
    expect(subpage?.status()).toBe(404);
    const csv = await client.page.request.get("/api/admin/stats?weeks=8");
    expect(csv.status()).toBe(404);
  });

  test("users: search finds a person by name and by Telegram ID, and an unknown name shows the empty state", async ({ persona, admin }) => {
    const lastName = uniqueLastName("Искомый");
    const someone = await persona({ firstName: "Глеб", lastName });
    const { page } = admin;
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { level: 1, name: "Пользователи" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Новые пользователи" })).toBeVisible();

    const search = page.getByRole("searchbox", { name: "Поиск" });
    await search.fill(lastName);
    await page.getByRole("button", { name: "Найти" }).click();
    await expect(page).toHaveURL(/\?q=/);
    await expect(page.getByRole("heading", { name: "Найдено" })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Глеб ${lastName}`) })).toBeVisible();
    await expectAccessible(page);

    await search.fill(String(someone.telegramId));
    await page.getByRole("button", { name: "Найти" }).click();
    await expect(page.getByRole("link", { name: new RegExp(`Глеб ${lastName}`) })).toBeVisible();

    await search.fill(uniqueLastName("Никтоженет"));
    await page.getByRole("button", { name: "Найти" }).click();
    await expect(page.getByRole("heading", { name: "Никого не нашли" })).toBeVisible();
    await expectAccessible(page);
  });

  test("users: the card shows account, roles, plans and counts without the client's data", async ({ persona, admin }) => {
    const trainer = await namedTrainer(persona, "Тимур");
    const { page } = admin;
    const errors = collectErrors(page);
    await page.goto(`/admin/users/${trainer.userId}`);
    await expect(page.getByRole("heading", { level: 2, name: `Тимур ${trainer.lastName}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Аккаунт" })).toBeVisible();
    await expect(page.getByText(String(trainer.telegramId))).toBeVisible();
    await expect(page.getByRole("heading", { name: "Роли" })).toBeVisible();
    await expect(page.getByText("Тренер", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Не отправлена")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Тарифы" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Выдать или отозвать тариф" })).toHaveAttribute("href", `/admin/plans?user=${trainer.userId}`);
    await expect(page.getByRole("heading", { name: "Пары и занятия" })).toBeVisible();
    await expect(page.getByText("Анкеты, замеры, фото и заметки админам не видны.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Заблокировать" })).toBeVisible();
    await expectAccessible(page);

    // An admin's own card has no block button, and an unknown id is not found.
    await page.goto(`/admin/users/${admin.userId}`);
    await expect(page.getByText("Себя заблокировать нельзя.").or(page.getByText("Админа заблокировать нельзя."))).toBeVisible();
    await expect(page.getByRole("button", { name: "Заблокировать" })).toHaveCount(0);
    await page.goto(`/admin/users/${crypto.randomUUID()}`);
    await expect(page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("users: blocking needs a reason, refuses the next sign-in, and unblocking lets the person in again", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const lastName = uniqueLastName("Блокиров");
    const someone = await persona({ firstName: "Семён", lastName });
    const { page } = admin;
    await page.goto(`/admin/users/${someone.userId}`);
    await page.getByRole("button", { name: "Заблокировать" }).click();
    await expect(page.getByRole("textbox", { name: "Причина" })).toBeVisible();
    await page.getByRole("button", { name: "Заблокировать" }).click();
    await expect(page.getByText("Напиши причину")).toBeVisible();
    await page.getByRole("textbox", { name: "Причина" }).fill("Спам в отзывах");
    await page.getByRole("button", { name: "Заблокировать" }).click();
    await expectToast(page, "Пользователь заблокирован");
    await expect(page.getByText("Заблокирован", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Спам в отзывах")).toBeVisible();
    await expectAccessible(page);

    const signIn = (request: typeof someone.context.request) =>
      request.post("/api/auth/telegram/mini-app", {
        headers: { origin: new URL(page.url()).origin, "content-type": "application/json" },
        data: { initData: signedInitData({ id: someone.telegramId, first_name: "Семён", last_name: lastName, language_code: "ru" }) },
      });
    const refused = await signIn(someone.context.request);
    expect(refused.status()).toBe(403);
    // The person sees why: the reason the admin gave comes back with the refusal (#235).
    expect(await refused.json()).toEqual({ error: "account_blocked", reason: "Спам в отзывах" });

    // The list marks the person blocked.
    await page.goto(`/admin/users?q=${encodeURIComponent(lastName)}`);
    await expect(page.getByRole("link", { name: new RegExp(`Семён ${lastName}`) })).toContainText("Заблокирован");

    await page.goto(`/admin/users/${someone.userId}`);
    await page.getByRole("button", { name: "Разблокировать" }).click();
    await page.getByRole("textbox", { name: "Причина" }).fill("Разобрались");
    await page.getByRole("button", { name: "Разблокировать" }).click();
    await expectToast(page, "Блокировка снята");
    await expect(page.getByRole("button", { name: "Заблокировать" })).toBeVisible();
    expect((await signIn(someone.context.request)).status()).toBe(200);

    // Both actions are in the audit log, with who did them.
    await page.goto("/admin/audit?action=user");
    await expect(page.getByRole("link", { name: "Блокировки" })).toHaveAttribute("aria-current", /page|true/);
    const mine = page.getByText(`Кто: Вера ${admin.lastName}`);
    await expect(mine).toHaveCount(2);
    await expect(page.getByText("Пользователь заблокирован").first()).toBeVisible();
    await expect(page.getByText("Блокировка снята").first()).toBeVisible();
  });

  test("invites: an admin creates an invite whose code makes a new person a trainer, and revokes another", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const { page } = admin;
    const note = `Зал на Лесной ${uniqueLastName("")}`;
    await page.goto("/admin/invites");
    await expect(page.getByRole("heading", { level: 1, name: "Приглашения тренеров" })).toBeVisible();
    await expectAccessible(page);

    // Validation: a validity of 0 days is refused.
    await page.getByRole("textbox", { name: "Для кого" }).fill(note);
    const days = page.getByRole("spinbutton", { name: "Сколько дней действует" });
    await days.fill("0");
    await page.getByRole("button", { name: "Создать приглашение" }).click();
    expect(await days.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(true);
    await expect(page.getByRole("heading", { name: "Приглашение готово" })).toHaveCount(0);

    await days.fill("7");
    await page.getByRole("button", { name: "Создать приглашение" }).click();
    await expect(page.getByRole("heading", { name: "Приглашение готово" })).toBeVisible();
    const code = (await page.locator("dt", { hasText: "Код" }).locator("xpath=following-sibling::dd").innerText()).trim();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(page.getByRole("img", { name: "QR-код со ссылкой на приглашение" })).toBeVisible();
    await expect(page.getByText(/startapp=ti_/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("heading", { name: "Приглашение готово" })).toHaveCount(0);

    await page.reload();
    const row = inviteRow(page, note, "Действует");
    await expect(row).toContainText(`Код …${code.slice(-4)}`);

    // The code works for a new person through the redeem screen.
    const newcomer = await persona({ firstName: "Лев", lastName: uniqueLastName("Новичков") });
    await newcomer.page.goto(`/onboarding/trainer?code=${code.replaceAll("-", "")}`);
    await expect(newcomer.page.getByText("Приглашение действует")).toBeVisible();
    await expectAccessible(newcomer.page);
    await newcomer.page.getByRole("button", { name: "Стать тренером" }).click();
    await expect(newcomer.page).toHaveURL(/\/onboarding\/trainer\/|\/trainer/);
    await page.reload();
    await expect(inviteRow(page, note, "Использован")).toContainText(
      "Использовал Лев",
    );

    // A second, unused invite gets revoked; its code then says so.
    const second = `${note} второй`;
    await page.getByRole("textbox", { name: "Для кого" }).fill(second);
    await page.getByRole("button", { name: "Создать приглашение" }).click();
    const secondCode = (await page.locator("dt", { hasText: "Код" }).locator("xpath=following-sibling::dd").innerText()).trim();
    await page.getByRole("button", { name: "Готово" }).click();
    await page.reload();
    const secondRow = inviteRow(page, second, "Действует");
    await secondRow.getByRole("button", { name: "Отозвать" }).click();
    await page.getByRole("button", { name: "Да, отозвать" }).click();
    await expectToast(page, "Приглашение отозвано");
    await expect(inviteRow(page, second, "Отозван")).toBeVisible();
    const late = await persona({ firstName: "Яна", lastName: uniqueLastName("Опоздалова") });
    await late.page.goto(`/onboarding/trainer?code=${secondCode.replaceAll("-", "")}`);
    await expect(late.page.getByText("Приглашение отозвано")).toBeVisible();
    await expect(late.page.getByRole("button", { name: "Стать тренером" })).toHaveCount(0);

    await page.goto("/admin/audit?action=trainer_invite");
    await expect(page.getByText(`Кто: Вера ${admin.lastName}`)).toHaveCount(3);
    await expect(page.getByText("Приглашение отозвано").first()).toBeVisible();
  });

  test("verification: an admin approves one trainer and rejects another with a reason", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const good = await namedTrainer(persona, "Олег");
    const weak = await namedTrainer(persona, "Инна");
    await submitVerification(good, "Диплом института физкультуры");
    await submitVerification(weak, "Сертификат курса");
    const { page } = admin;
    await page.goto("/admin/verification");
    await expect(page.getByRole("heading", { level: 1, name: "Верификация тренеров" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "На проверке" })).toBeVisible();
    const goodHeading = page.getByRole("heading", { level: 3, name: `Олег ${good.lastName}` });
    const goodCard = cardOf(page, goodHeading, page.getByRole("button", { name: "Верифицировать" }));
    await expect(goodCard.getByRole("link", { name: "Открыть «Диплом института физкультуры»" })).toBeVisible();
    await expectAccessible(page);
    await goodCard.getByRole("button", { name: "Верифицировать" }).click();
    await expectToast(page, "Тренер верифицирован");

    const weakHeading = page.getByRole("heading", { level: 3, name: `Инна ${weak.lastName}` });
    const weakCard = cardOf(page, weakHeading, page.getByRole("button", { name: "Отклонить" }));
    await weakCard.getByRole("button", { name: "Отклонить" }).click();
    await weakCard.getByRole("button", { name: "Отклонить" }).click();
    await expect(weakCard.getByText("Напиши причину отказа")).toBeVisible();
    await weakCard.getByRole("textbox", { name: "Причина отказа" }).fill("Не видно печати на сертификате");
    await weakCard.getByRole("button", { name: "Отклонить" }).click();
    await expectToast(page, "Верификация отклонена");

    await page.reload();
    await expect(goodHeading).toHaveCount(0);
    await expect(weakHeading).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Последние решения" })).toBeVisible();

    // The trainers see the outcome on their own screen.
    await good.page.goto("/trainer/verification");
    await expect(good.page.getByText("Пройдена")).toBeVisible();
    await weak.page.goto("/trainer/verification");
    await expect(weak.page.getByText("Отклонена").first()).toBeVisible();
    await expect(weak.page.getByText("Не видно печати на сертификате")).toBeVisible();
    await expectAccessible(weak.page);

    await page.goto("/admin/audit?action=verification");
    await expect(page.getByText(`Кто: Вера ${admin.lastName}`)).toHaveCount(2);
  });

  test("feedback: a user's message reaches the inbox, and the admin sets its status and replies", async ({ persona, client }) => {
    const admin = await namedAdmin(persona);
    const body = `Не открывается дневник после обновления ${uniqueLastName("")}`;
    const user = client.page;
    await user.goto("/feedback?from=/client/diary");
    await expect(user.getByRole("heading", { level: 1, name: "Обратная связь" })).toBeVisible();
    await expectAccessible(user);
    await user.getByRole("button", { name: "Отправить" }).click();
    await expect(user.getByText("Напиши хотя бы пару слов")).toBeVisible();
    await user.getByRole("radio", { name: "Ошибка" }).click();
    await user.getByRole("textbox", { name: "Сообщение" }).fill(body);
    await user.getByRole("button", { name: "Отправить" }).click();
    await expect(user.getByRole("heading", { name: "Спасибо, получили" })).toBeVisible();
    await expect(user.getByRole("link", { name: "Вернуться" })).toHaveAttribute("href", "/client/diary");
    await expectAccessible(user);

    const { page } = admin;
    await page.goto("/admin/feedback");
    await expect(page.getByRole("heading", { level: 1, name: "Обратная связь" })).toBeVisible();
    const row = page.getByRole("link", { name: new RegExp(body) });
    await expect(row).toContainText("Новое");
    await expect(row).toContainText("Ошибка");
    await expectAccessible(page);
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Обращение" })).toBeVisible();
    await expect(page.getByRole("main").locator("p", { hasText: body })).toBeVisible();
    await expect(page.getByText("/client/diary")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("radio", { name: "В работе" }).click();
    await expect(page.getByRole("radio", { name: "В работе" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("textbox", { name: "Текст ответа" }).fill("Спасибо, нашли причину, починим в пятницу.");
    await page.getByRole("button", { name: "Отправить в бот" }).click();
    await expectToast(page, "Ответ отправлен");
    await page.reload();
    await expect(page.getByRole("button", { name: "Отправить новый ответ" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "В работе" })).toHaveAttribute("aria-checked", "true");

    await page.goto("/admin/feedback?status=in_progress");
    await expect(page.getByRole("link", { name: new RegExp(body) })).toContainText("В работе");
    await page.goto("/admin/feedback?status=closed");
    await expect(page.getByRole("link", { name: new RegExp(body) })).toHaveCount(0);
  });

  test("data requests: the log keeps open requests by deadline and the closed ones below", async ({ persona, client }) => {
    const admin = await namedAdmin(persona);
    const tag = uniqueLastName("");
    const asked = `Какие данные обо мне хранятся ${tag}`;
    const answered = `Исправьте мою фамилию ${tag}`;
    for (const [body, type] of [[asked, "access"], [answered, "correction"]] as const) {
      ok(
        await client.db.from("feedback").insert({ user_id: client.userId, zone: "client", kind: "data_request", request_type: type, body, route: "/feedback" }),
        "data request",
      );
    }

    const { page } = admin;
    await page.goto("/admin/feedback?status=requests");
    const open = page.locator("section", { has: page.getByRole("heading", { name: "Открытые" }) });
    await expect(open.getByRole("link", { name: new RegExp(asked) })).toContainText("Узнать, какие данные есть");
    await expect(open.getByRole("link", { name: new RegExp(answered) })).toContainText("До ");
    await expectAccessible(page);

    await open.getByRole("link", { name: new RegExp(answered) }).click();
    await page.getByRole("radio", { name: "Закрыто" }).click();
    await expect(page.getByRole("radio", { name: "Закрыто" })).toHaveAttribute("aria-checked", "true");

    // Closed requests stay in the log, under their own heading, with the status instead of the deadline.
    await page.goto("/admin/feedback?status=requests");
    const closed = page.locator("section", { has: page.getByRole("heading", { name: "Закрытые" }) });
    await expect(closed.getByRole("link", { name: new RegExp(answered) })).toContainText("Закрыто");
    await expect(open.getByRole("link", { name: new RegExp(answered) })).toHaveCount(0);
    await expect(open.getByRole("link", { name: new RegExp(asked) })).toBeVisible();
    await expectAccessible(page);
  });

  test("reviews: a disputed review is hidden with a reason, and the empty filter says so", async ({ persona, trainer, client }) => {
    const admin = await namedAdmin(persona);
    for (const days of [9, 6, 3]) {
      ok(
        await trainer.db.rpc("record_past_session", {
          p_coaching_id: client.coachingId,
          p_starts_at: new Date(Date.now() - days * 86_400_000).toISOString(),
          p_duration_min: 60,
          p_mode: "online",
        }),
        "past session",
      );
    }
    const text = `Тренер опаздывал и грубил ${uniqueLastName("")}`;
    const reviewId = ok(await client.db.rpc("save_review", { p_coaching_id: client.coachingId, p_rating: 1, p_body: text }), "review");
    ok(await trainer.db.rpc("dispute_review", { p_review_id: reviewId, p_reason: "false_facts", p_body: "Я не опаздывал, есть переписка" }), "dispute");

    const { page } = admin;
    await page.goto("/admin/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Отзывы" })).toBeVisible();
    const row = page.getByRole("link", { name: new RegExp(text) });
    await expect(row).toBeVisible();
    await expectAccessible(page);
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Спор об отзыве" })).toBeVisible();
    await expect(page.getByText("Я не опаздывал, есть переписка")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Скрыть", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Скрыть отзыв" });
    await sheet.getByRole("button", { name: "Скрыть отзыв" }).click();
    await expect(sheet.getByText("Напиши причину")).toBeVisible();
    await sheet.getByRole("textbox", { name: "Причина" }).fill("Факты не подтвердились");
    await sheet.getByRole("button", { name: "Скрыть отзыв" }).click();
    await expectToast(page, "Отзыв скрыт");
    await expect(page.getByText("Причина для автора: Факты не подтвердились")).toBeVisible();

    await page.goto("/admin/reviews?status=hidden");
    await expect(page.getByRole("link", { name: new RegExp(text) })).toBeVisible();
    await page.goto("/admin/reviews?status=kept");
    await expect(page.getByRole("link", { name: new RegExp(text) })).toHaveCount(0);
  });

  test("plans: an admin finds a trainer, grants Pro with a reason, then revokes it", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const trainer = await namedTrainer(persona, "Артём");
    const { page } = admin;
    await page.goto("/admin/plans");
    await expect(page.getByRole("heading", { level: 1, name: "Тарифы и выдачи" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("searchbox").fill(trainer.lastName);
    await page.getByRole("searchbox").press("Enter");
    await page.getByRole("link", { name: new RegExp(`Артём ${trainer.lastName}`) }).click();
    await expect(page).toHaveURL(new RegExp(`user=${trainer.userId}`));
    await expect(page.getByText("Сейчас тарифов нет, человек на Free.")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("radio", { name: "Pro для тренера" }).click();
    await page.getByRole("textbox", { name: "Причина" }).fill("ок");
    await page.getByRole("button", { name: "Выдать" }).click();
    await expect(page.getByText("Нужно хотя бы 3 символа")).toBeVisible();
    await page.getByRole("textbox", { name: "Причина" }).fill("Тренер беты из первой волны");
    await page.getByRole("button", { name: "Выдать" }).click();
    await expectToast(page, "Тариф выдан, человеку придёт сообщение в боте");
    await expect(page.getByText("Сейчас тарифов нет, человек на Free.")).toHaveCount(0);
    await expect(page.getByText("Причина: «Тренер беты из первой волны»").first()).toBeVisible();

    await trainer.page.goto("/settings/plan");
    await expect(trainer.page.getByText("Pro", { exact: true }).first()).toBeVisible();
    await expectAccessible(trainer.page);

    await page.getByRole("button", { name: "Отозвать" }).first().click();
    const revoke = page.locator("form").filter({ has: page.getByRole("button", { name: "Отмена" }) });
    await revoke.getByRole("textbox", { name: "Причина" }).fill("Бета закончилась");
    await revoke.getByRole("button", { name: "Отозвать" }).click();
    await expectToast(page, "Тариф отозван");
    await expect(page.getByText("Сейчас тарифов нет, человек на Free.")).toBeVisible();
    await expect(page.getByText("Отозван: «Бета закончилась»").first()).toBeVisible();

    await page.goto("/admin/audit?action=plan");
    await expect(page.getByText(`Кто: Вера ${admin.lastName}`)).toHaveCount(2);
    await expect(page.getByText("Тариф выдан").first()).toBeVisible();
  });

  test("analytics: the platform view and one trainer's page open with their sections", async ({ admin, trainer, client }) => {
    void client;
    const { page } = admin;
    const errors = collectErrors(page);
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Аналитика" })).toBeVisible();
    for (const header of ["Метрики беты за 14 дней", "Воронка тренеров", "Платформа за период", "Чем пользуются клиенты", "Тренеры", "Клиенты"]) {
      await expect(page.getByRole("heading", { name: header, exact: true })).toBeVisible();
    }
    await expectAccessible(page);
    await page.getByRole("link", { name: "90 дней" }).click();
    await expect(page).toHaveURL(/days=90/);
    await expect(page.getByRole("link", { name: "90 дней" })).toHaveAttribute("aria-current", "true");

    await page.goto(`/admin/analytics/trainers/${trainer.userId}?days=30`);
    await expect(page.getByText("Иван Тренеров").first()).toBeVisible();
    await expect(page.getByText("За период")).toBeVisible();
    await expect(page.getByText("Открытие этой страницы записано в журнал действий.")).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/admin/analytics/trainers/${crypto.randomUUID()}`);
    await expect(page.getByText("Тренер не найден")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("stats: the owner statistics switch period and download a CSV", async ({ admin }) => {
    const { page } = admin;
    const errors = collectErrors(page);
    await page.goto("/admin/stats");
    await expect(page.getByRole("heading", { level: 1, name: "Статистика" })).toBeVisible();
    for (const header of ["Главное", "Цели беты", "Аудитория", "Активность", "Занятия и деньги"]) {
      await expect(page.getByRole("heading", { name: header, exact: true })).toBeVisible();
    }
    await expectAccessible(page);
    await page.getByRole("link", { name: "26 недель" }).click();
    await expect(page).toHaveURL(/weeks=26/);

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Скачать CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const path = await file.path();
    const { readFile } = await import("node:fs/promises");
    const text = await readFile(path, "utf8");
    expect(text.split("\n").length).toBeGreaterThan(2);
    expect(errors()).toEqual([]);
  });

  test("audit: the filters narrow the log and the target links to the user card", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const someone = await persona({ firstName: "Нина", lastName: uniqueLastName("Журналова") });
    ok(await admin.db.rpc("admin_block_user", { p_user_id: someone.userId, p_reason: "Проверка журнала" }), "block");
    const { page } = admin;
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Журнал действий" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Последние 100 записей" })).toBeVisible();
    await page.getByRole("navigation", { name: "Какие действия показать" }).getByRole("link", { name: "Блокировки" }).click();
    await expect(page).toHaveURL(/action=user/);
    const entry = page.locator("div").filter({ has: page.getByText(`Кто: Вера ${admin.lastName}`) }).filter({ hasText: "Проверка журнала" }).last();
    await entry.getByRole("link", { name: new RegExp(`Нина`) }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${someone.userId}`));
    await expect(page.getByText("Проверка журнала", { exact: true })).toBeVisible();
  });

  test("audit: the log passes axe with a person linked in an entry", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const someone = await persona({ firstName: "Нина", lastName: uniqueLastName("Журналова") });
    ok(await admin.db.rpc("admin_block_user", { p_user_id: someone.userId, p_reason: "Проверка журнала" }), "block");
    await admin.page.goto("/admin/audit?action=user");
    await expect(admin.page.getByText(`Кто: Вера ${admin.lastName}`)).toBeVisible();
    await expectAccessible(admin.page);
  });
});
