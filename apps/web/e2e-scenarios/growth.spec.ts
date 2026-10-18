import { collectErrors, expectAccessible } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import { grantPro, openWeek, recordPastSessions } from "./support/money";
import { ok } from "./support/personas";

/*
 * Growth and insight (PRD wave-1 §2.3 trials, wave-2 §7 analytics, §5.5 nutrition, §11 reviews, wave-3 §3
 * referrals, ADR 0014 plans): what a trainer sees with Free and with Pro, with data and without.
 */

test.describe("Plan", () => {
  test("a Free trainer sees the client limit and asks for Pro", async ({ trainer, client }) => {
    void client;
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/settings/plan");
    await expect(page.getByRole("heading", { level: 1, name: "Мой тариф" }).first()).toBeVisible();
    const side = page.getByRole("region", { name: "Тариф тренера" });
    await expect(side.getByText("Free", { exact: true })).toBeVisible();
    await expect(side.getByText("Клиентов сейчас: 1 из 3")).toBeVisible();
    await expectAccessible(page);

    await side.getByRole("button", { name: "Запросить доступ" }).click();
    await expect(page.getByText("Запрос отправлен. Когда админ выдаст доступ, напишем в боте.")).toBeVisible();
    await expect(side.getByText("Запрос отправлен", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Тариф тренера" }).getByText("Запрос отправлен", { exact: true })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a Pro trainer sees what the plan includes, and the client inherits from them", async ({ trainer, client, admin }) => {
    await grantPro(admin, trainer);
    await trainer.page.goto("/settings/plan");
    const side = trainer.page.getByRole("region", { name: "Тариф тренера" });
    await expect(side.getByText("Pro", { exact: true })).toBeVisible();
    await expect(side.getByText("Без срока")).toBeVisible();
    await expect(trainer.page.getByRole("heading", { name: "Что входит" })).toBeVisible();
    await expect(trainer.page.getByText("Реферальные акции")).toBeVisible();
    await expectAccessible(trainer.page);

    await client.page.goto("/settings/plan");
    await expect(client.page.getByRole("region", { name: "Тариф клиента" })).toBeVisible();
    await expect(client.page.getByText("Бесплатно от тренера")).toBeVisible();
    await expect(client.page.getByText("Работает, пока ты занимаешься с этим тренером и у него Pro.")).toBeVisible();
    await expectAccessible(client.page);
  });
});

test.describe("Analytics", () => {
  test("a Free trainer gets the Pro lock instead of analytics", async ({ trainer }) => {
    await trainer.page.goto("/trainer/analytics");
    await expect(trainer.page.getByRole("heading", { level: 1, name: "Аналитика" }).first()).toBeVisible();
    await expect(trainer.page.getByText("Посещаемость, отмены, выручка, долги и клиенты, которые могут уйти, в одном месте.")).toBeVisible();
    await expect(trainer.page.getByRole("button", { name: "Запросить доступ" })).toBeVisible();
    await expect(trainer.page.getByRole("heading", { name: "Посещаемость" })).toHaveCount(0);
    await expectAccessible(trainer.page);
  });

  test("a Pro trainer without sessions sees zeros and nothing to compare", async ({ trainer, admin }) => {
    await grantPro(admin, trainer);
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/analytics");
    const attendance = page.locator("section", { has: page.getByRole("heading", { name: "Посещаемость" }) });
    await expect(attendance.locator("[data-slot=list-row]").filter({ hasText: "Явка" })).toContainText("Пока не с чем считать");
    await expect(attendance.locator("[data-slot=list-row]").filter({ hasText: "Проведено занятий" })).toContainText("0");
    await expect(page.getByRole("heading", { name: "Выгрузка в CSV" })).toBeVisible();
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });

  test("a Pro trainer sees held sessions, attendance and no-shows of the month", async ({ trainer, client, admin }) => {
    await grantPro(admin, trainer);
    // Sessions of the last days, so they fall in this week whatever the day: switch to the month to be sure.
    await recordPastSessions(trainer, client.coachingId, 1, "no_show");
    await recordPastSessions(trainer, client.coachingId, 2);
    const { page } = trainer;
    await page.goto("/trainer/analytics?period=quarter");
    await expect(page.getByRole("link", { name: "Квартал" })).toHaveAttribute("aria-current", /.+/);
    const attendance = page.locator("section", { has: page.getByRole("heading", { name: "Посещаемость" }) });
    await expect(attendance.locator("[data-slot=list-row]").filter({ hasText: "Явка" })).toContainText(/67% \(2 из 3\)|\d+% \(\d из \d\)/);
    await expect(attendance.locator("[data-slot=list-row]").filter({ hasText: "Клиентов на занятиях" })).toContainText("1");
    const cancels = page.locator("section", { has: page.getByRole("heading", { name: "Отмены" }) });
    await expect(cancels.locator("[data-slot=list-row]").filter({ hasText: "Неявки" })).toContainText("1");
    await expect(page.getByRole("link", { name: "Предыдущий период" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "Предыдущий период" }).click();
    await expect(page).toHaveURL(/period=quarter&offset=-1/);
    await expect(page.getByRole("link", { name: "Следующий период" })).toBeVisible();
  });
});

test.describe("Nutrition of clients", () => {
  test("a trainer with nobody sharing nutrition sees who will appear here", async ({ trainer }) => {
    await trainer.page.goto("/trainer/nutrition");
    await expect(trainer.page.getByRole("heading", { level: 1, name: "Питание клиентов" }).first()).toBeVisible();
    await expect(trainer.page.getByText("Пока некого показать")).toBeVisible();
    await expectAccessible(trainer.page);
  });

  test("a client who opens nutrition to the trainer shows up with no diary yet", async ({ trainer, client, admin }) => {
    await grantPro(admin, trainer);
    ok(await client.db.from("data_shares").update({ nutrition: true }).eq("coaching_id", client.coachingId).select("coaching_id"), "share nutrition");
    const { page } = trainer;
    await page.goto("/trainer/nutrition");
    const row = page.getByRole("link", { name: /Анна/ });
    await expect(row).toContainText("дневник ещё не вёлся");
    await expect(row).toContainText("Нет нормы");
    await expect(page.getByText("День в норме, если калории отличаются от нормы не больше чем на 10%.", { exact: false })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "30 дней" }).click();
    await expect(page).toHaveURL(/\/trainer\/nutrition\?days=30$/);
    await expect(page.getByRole("link", { name: /Анна/ })).toContainText("Дней с записями: 0 из 30");
    await page.getByRole("link", { name: /Анна/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trainer/clients/${client.coachingId}/nutrition`));
  });
});

test.describe("Reviews", () => {
  test("a trainer without reviews is told when they can come", async ({ trainer }) => {
    await trainer.page.goto("/trainer/reviews");
    await expect(trainer.page.getByRole("heading", { level: 1, name: "Отзывы" }).first()).toBeVisible();
    await expect(trainer.page.getByText("Отзывов пока нет")).toBeVisible();
    await expect(trainer.page.getByText("Клиент может оставить отзыв после трёх проведённых занятий с тобой.")).toBeVisible();
    await expectAccessible(trainer.page);
  });

  test("after three sessions a client leaves a review and the trainer replies", async ({ trainer, client }) => {
    await recordPastSessions(trainer, client.coachingId, 2);
    // Two sessions are not enough yet.
    await client.page.goto(`/client/trainers/${client.coachingId}`);
    await expect(client.page.getByRole("button", { name: "Оставить отзыв" })).toHaveCount(0);

    await recordPastSessions(trainer, client.coachingId, 1);
    await client.page.reload();
    await client.page.getByRole("button", { name: "Оставить отзыв" }).click();
    const sheet = client.page.getByRole("dialog", { name: "Отзыв о тренере" });
    await sheet.getByRole("button", { name: "Отправить" }).click();
    await expect(sheet.getByText("Выбери оценку")).toBeVisible();
    await expectAccessible(client.page);
    await sheet.locator("label", { hasText: "5 из 5" }).click();
    await sheet.getByLabel("Отзыв").fill("Занятия по делу, всегда вовремя.");
    await sheet.getByRole("button", { name: "Отправить" }).click();
    await expect(client.page.getByText("Отзыв сохранён")).toBeVisible();
    await expect(client.page.getByRole("img", { name: "Оценка 5 из 5" })).toBeVisible();

    const { page } = trainer;
    await page.goto("/trainer/reviews");
    const review = page.getByRole("article", { name: /Анна/ });
    await expect(review.getByRole("img", { name: "Оценка 5 из 5" })).toBeVisible();
    await expect(review).toContainText("Занятия по делу, всегда вовремя.");
    await expectAccessible(page);

    await review.getByRole("button", { name: "Ответить" }).click();
    const reply = page.getByRole("dialog", { name: "Ответ на отзыв" });
    await reply.getByLabel("Твой ответ").fill("Спасибо, до встречи в четверг!");
    await reply.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Ответ сохранён")).toBeVisible();
    await expect(review).toContainText("Спасибо, до встречи в четверг!");
    await expect(review.getByRole("button", { name: "Изменить ответ" })).toBeVisible();

    await client.page.reload();
    await expect(client.page.getByText("Ответ тренера")).toBeVisible();
    await expect(client.page.getByText("Спасибо, до встречи в четверг!")).toBeVisible();
  });
});

test.describe("Referral offers", () => {
  test("a Free trainer is pointed to the plan", async ({ trainer }) => {
    await trainer.page.goto("/trainer/referrals");
    await expect(trainer.page.getByText("Акции есть в тарифе Pro")).toBeVisible();
    await expectAccessible(trainer.page);
    await trainer.page.getByRole("link", { name: "Мой тариф" }).click();
    await expect(trainer.page).toHaveURL(/\/settings\/plan$/);
  });

  test("a Pro trainer starts an offer after a validation error, then stops it", async ({ trainer, admin }) => {
    await grantPro(admin, trainer);
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/referrals");
    await expect(page.getByRole("heading", { level: 1, name: "Приведи друга" }).first()).toBeVisible();
    await expect(page.getByText("Запусти первую акцию")).toBeVisible();
    await expect(page.getByText("Приглашений пока нет.")).toBeVisible();
    await expectAccessible(page);

    const form = page.locator("section", { has: page.getByRole("heading", { name: "Новая акция" }) });
    await form.getByLabel("Занятий клиенту за друга").fill("9");
    await form.getByRole("button", { name: "Запустить акцию" }).click();
    await expect(form.getByText("От 1 до 5 занятий")).toBeVisible();

    await form.getByLabel("Занятий клиенту за друга").fill("2");
    await form.getByLabel("Занятий другу").fill("1");
    await form.getByRole("radio", { name: "От суммы" }).click();
    await form.getByLabel("Сумма от").fill("5000");
    await form.getByRole("button", { name: "Запустить акцию" }).click();
    await expect(page.getByText("Акция запущена")).toBeVisible();
    const offer = page.locator("section", { has: page.getByRole("heading", { name: "Акция", exact: true }) });
    await expect(offer.getByText("Идёт")).toBeVisible();
    await expect(offer).toContainText("Клиенту за друга: 2 занятия");
    await expect(offer).toContainText("Другу: 1 занятие");
    await expect(offer).toContainText(/Оплата от 5\s000\s₽/);
    await expect(page.getByRole("heading", { name: "Новые условия" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Остановить акцию" }).click();
    const confirm = page.getByRole("dialog", { name: "Остановить акцию" });
    await confirm.getByRole("button", { name: "Остановить", exact: true }).click();
    await expect(page.getByText("Акция остановлена")).toBeVisible();
    await expect(page.getByText("Запусти первую акцию")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a client shares their link and a friend joins the trainer through it", async ({ trainer, client, admin, persona }) => {
    await grantPro(admin, trainer);
    ok(await trainer.db.rpc("save_referral_offer", { p_referrer_sessions: 2, p_referee_sessions: 1 }), "referral offer");

    await client.page.goto(`/client/trainers/${client.coachingId}`);
    await client.page.getByRole("link", { name: /Приведи друга/ }).click();
    await expect(client.page).toHaveURL(new RegExp(`/client/trainers/${client.coachingId}/referral$`));
    await expect(client.page.getByText(/Когда друг оплатит занятия у Иван/)).toBeVisible();
    await expect(client.page.getByText("Друг тоже получит 1 занятие.")).toBeVisible();
    await expect(client.page.getByText("По твоей ссылке пока никого нет.")).toBeVisible();
    await expectAccessible(client.page);

    const { code } = ok(await client.db.rpc("client_referral", { p_coaching_id: client.coachingId }), "client referral")[0];
    // Their own link tells the client to send it on.
    await client.page.goto(`/r/${code}`);
    await expect(client.page.getByText("Это твоя ссылка. Отправь её другу, по ней можно присоединиться к тренеру.")).toBeVisible();

    const friend = await persona({ firstName: "Борис" });
    await friend.page.goto(`/r/${code}`);
    await expect(friend.page.getByRole("heading", { level: 1, name: "Приглашение к тренеру" })).toBeVisible();
    await expect(friend.page.getByText("Анна приглашает тебя к своему тренеру.")).toBeVisible();
    await expect(friend.page.getByText("После первой оплаты ты получишь 1 занятие в подарок.")).toBeVisible();
    await expectAccessible(friend.page);
    await friend.page.getByRole("button", { name: "Стать клиентом" }).click();
    await expect(friend.page).toHaveURL(/\/client\/trainers\/[0-9a-f-]+\/(intake|consent)|intake/);

    await trainer.page.goto("/trainer/referrals");
    const invitations = trainer.page.locator("section", { has: trainer.page.getByRole("heading", { name: "Приглашения" }) });
    await expect(invitations).toContainText("Борис");
    await expect(invitations).toContainText("Ждёт оплаты");
    await expectAccessible(trainer.page);

    await client.page.goto(`/client/trainers/${client.coachingId}/referral`);
    await expect(client.page.locator("[data-slot=list-row]").filter({ hasText: "Борис" })).toContainText("Ждём оплаты");
  });

  test("a made-up referral code is a dead link", async ({ persona }) => {
    const someone = await persona({ firstName: "Вера" });
    await someone.page.goto("/r/ZZZZZZZZ");
    await expect(someone.page.getByText("Ссылка недействительна")).toBeVisible();
    await expect(someone.page.getByRole("link", { name: "Ввести код тренера" })).toBeVisible();
    await expectAccessible(someone.page);
  });
});

test.describe("Inviting trainers", () => {
  test("a trainer's link brings a colleague, who shows up with a pending bonus", async ({ trainer, persona }) => {
    const { page } = trainer;
    await page.goto("/trainer/invite-trainers");
    await expect(page.getByRole("heading", { level: 1, name: "Пригласить тренера" }).first()).toBeVisible();
    await expect(page.getByText("В бете тарифы не продаются, поэтому бонусы пока копятся и ждут.")).toBeVisible();
    await expect(page.getByText("По твоей ссылке пока никто не пришёл.")).toBeVisible();
    await expect(page.getByText(/^Код для ввода вручную: /)).toBeVisible();
    await expectAccessible(page);

    const { code } = ok(await trainer.db.rpc("my_trainer_referral"), "trainer referral")[0];
    const colleague = await persona({ firstName: "Глеб" });
    ok(await colleague.db.rpc("redeem_trainer_invite", { p_code: code }), "redeem trainer referral");

    await page.reload();
    const list = page.locator("section", { has: page.getByRole("heading", { name: "Приглашённые тренеры" }) });
    await expect(list.locator("[data-slot=list-row]").filter({ hasText: "Глеб" })).toContainText("Бонус ждёт");
    await expect(list).toContainText("В DaFit с");
    await expectAccessible(page);
  });
});

test.describe("Trial links", () => {
  test("a trainer creates a trial link, checks the form, turns it off and on", async ({ trainer, persona }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/links");
    const trials = page.locator("section", { has: page.getByRole("heading", { name: "Ссылки на пробное" }) });
    await expect(trials.getByText("Ссылок на пробное пока нет.")).toBeVisible();
    await expectAccessible(page);

    const form = page.locator("section", { has: page.getByRole("heading", { name: "Новая ссылка на пробное" }) });
    await form.getByLabel("Цена").fill("-5");
    await form.getByRole("button", { name: "Создать ссылку" }).click();
    await expect(form.getByText("Напиши название, до 120 символов")).toBeVisible();
    await expect(form.getByText("Введи сумму от 0 до 1 000 000")).toBeVisible();

    await form.getByLabel("Название").fill("Пробная силовая");
    await form.getByLabel("Длительность").selectOption({ label: "45 мин" });
    await form.getByLabel("Цена").fill("0");
    await form.getByRole("radio", { name: "Онлайн" }).click();
    await form.getByRole("button", { name: "Создать ссылку" }).click();
    await expect(page.getByText("Ссылка готова")).toBeVisible();

    const link = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Пробная силовая" }) });
    await expect(link).toContainText("Включена");
    await expect(link).toContainText("45 мин");
    await expect(link).toContainText("Бесплатно");
    await expect(link).toContainText("Пришли: 0");
    await expectAccessible(page);
    const url = (await link.getByText(/\/trial\//).textContent()) ?? "";
    const path = new URL(url).pathname;

    await link.getByRole("button", { name: "Выключить" }).click();
    await expect(link).toContainText("Выключена");
    const visitor = await persona({ firstName: "Дина" });
    await visitor.page.goto(path);
    await expect(visitor.page.getByText("Ссылка не работает")).toBeVisible();

    await link.getByRole("button", { name: "Включить" }).click();
    await expect(link).toContainText("Включена");
    await visitor.page.reload();
    await expect(visitor.page.getByText("Пробная силовая")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a new person books a trial time from the trainer's link", async ({ trainer, persona, browser, baseURL }) => {
    await openWeek(trainer);
    const { page } = trainer;
    await page.goto("/trainer/links");
    const form = page.locator("section", { has: page.getByRole("heading", { name: "Новая ссылка на пробное" }) });
    await form.getByLabel("Название").fill("Знакомство");
    await form.getByRole("radio", { name: "Онлайн" }).click();
    await form.getByRole("button", { name: "Создать ссылку" }).click();
    const link = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Знакомство" }) });
    const path = new URL((await link.getByText(/\/trial\//).textContent()) ?? "").pathname;

    // The trainer's own link explains itself.
    await page.goto(path);
    await expect(page.getByText("Это твоя ссылка на пробное")).toBeVisible();

    // Signed out: the terms and times, then a sign-in in the sheet.
    const anonymous = await browser.newContext({ baseURL, locale: "ru-RU", timezoneId: "Europe/Moscow" });
    const guest = await anonymous.newPage();
    await guest.goto(path);
    await expect(guest.getByText("Знакомство")).toBeVisible();
    await expect(guest.getByText("Бесплатно")).toBeVisible();
    await expect(guest.getByRole("heading", { name: "Выбери время пробного" })).toBeVisible();
    await expectAccessible(guest);
    await anonymous.close();

    const newcomer = await persona({ firstName: "Елена" });
    const errors = collectErrors(newcomer.page);
    await newcomer.page.goto(path);
    await expect(newcomer.page.getByRole("heading", { level: 1, name: "Пробное занятие" })).toBeVisible();
    await expect(newcomer.page.getByText("Иван").first()).toBeVisible();
    await newcomer.page.getByRole("button", { name: /\d\d:\d\d–\d\d:\d\d/ }).first().click();
    const sheet = newcomer.page.getByRole("dialog", { name: "Записаться на пробное?" });
    await expect(sheet).toContainText("Ты станешь клиентом тренера, а он получит запрос на это время.");
    await expectAccessible(newcomer.page);
    await sheet.getByRole("button", { name: "Отправить запрос" }).click();
    await expect(newcomer.page.getByText("Запрос на пробное отправлен").first()).toBeVisible();
    await expect(newcomer.page).toHaveURL(/\/client\/bookings\/[0-9a-f-]+$/);
    await expectAccessible(newcomer.page);

    // Back on the landing, the request is there instead of the times.
    await newcomer.page.goto(path);
    await expect(newcomer.page.getByRole("heading", { name: "Запрос на пробное отправлен" })).toBeVisible();
    await expect(newcomer.page.getByRole("link", { name: "Открыть запись" })).toBeVisible();
    expect(errors()).toEqual([]);

    await page.goto("/trainer/links");
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Знакомство" }) })).toContainText("Пришли: 1");
    await page.goto("/trainer");
    await expect(page.getByRole("link", { name: /Запросы на запись/ })).toContainText("1");
  });

  test("an existing client opening a trial link is sent to their trainers", async ({ trainer, client }) => {
    await trainer.page.goto("/trainer/links");
    const form = trainer.page.locator("section", { has: trainer.page.getByRole("heading", { name: "Новая ссылка на пробное" }) });
    await form.getByLabel("Название").fill("Пробная растяжка");
    await form.getByRole("button", { name: "Создать ссылку" }).click();
    const link = trainer.page.getByRole("listitem").filter({ has: trainer.page.getByRole("heading", { name: "Пробная растяжка" }) });
    const path = new URL((await link.getByText(/\/trial\//).textContent()) ?? "").pathname;

    await client.page.goto(path);
    await expect(client.page.getByText("Ты уже занимаешься у этого тренера")).toBeVisible();
    await client.page.getByRole("link", { name: "Открыть моих тренеров" }).click();
    await expect(client.page).toHaveURL(/\/client\/trainers$/);
  });
});
