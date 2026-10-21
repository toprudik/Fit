import type { Page } from "@playwright/test";
import { collectErrors, expectAccessible as axe, settle } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import { ok } from "./support/personas";
import {
  createGroup,
  createSession,
  fromNow,
  gotoReady,
  isoWeekday,
  ledgerTypes,
  mskAt,
  mskDay,
  openSlots,
  openWindow,
  pastSession,
  tap,
  todayStart,
} from "./support/schedule";

/**
 * Every screen passes axe once its transitions have finished. Right after a client-side navigation axe can
 * catch the tab bar between two colours, so a violation must still be there a moment later to count.
 */
async function expectAccessible(page: Page) {
  await settle(page);
  await expect(() => axe(page)).toPass({ timeout: 5_000 });
}

/*
 * The trainer's schedule (screens.md §3.2, §4.1 step 9, PRD wave-1 2.6): the week, the week template and
 * its slots, sessions made, changed and cancelled, attendance, waived charges and the check-in QR.
 */

/** The session's link on the schedule, whichever layout shows it: the day list on a phone, the grid on a desktop. */
const scheduleItem = (page: Page, name: RegExp) => page.getByRole("link", { name }).filter({ visible: true });

test.describe("schedule screen", () => {
  test("a new trainer sees an empty week that points to the week template", async ({ trainer }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    await gotoReady(page, "/trainer/schedule");
    await expect(page.getByRole("heading", { level: 1, name: "Расписание" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Неделя пока пустая" })).toBeVisible();
    await expect(page.getByText("Заполни шаблон недели, и свободные слоты появятся сами.")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "Создать шаблон недели" }).click();
    await expect(page).toHaveURL(/\/trainer\/schedule\/template$/);
    await expect(page.getByRole("heading", { level: 1, name: "Шаблон недели" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the week shows the sessions and moves a week forward and back", async ({ trainer, client }, testInfo) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    const day = mskDay(3);
    await createSession(trainer, client.coachingId, mskAt(3, 15), { title: "Спина и плечи" });
    await gotoReady(page, `/trainer/schedule?date=${day}`);
    const item = scheduleItem(page, /Анна Клиентова.*15:00–16:00|Спина и плечи.*15:00–16:00/);
    await expect(item).toHaveCount(1);
    await expectAccessible(page);

    // A week later the session is not there; the way back shows it again.
    await page.getByRole("link", { name: "Следующая неделя" }).click();
    await expect(page).toHaveURL(new RegExp(`date=${mskDay(10)}`));
    await expect(scheduleItem(page, /15:00–16:00/)).toHaveCount(0);
    await page.getByRole("link", { name: "Прошлая неделя" }).click();
    await expect(page).toHaveURL(new RegExp(`date=${day}`));
    await expect(item).toHaveCount(1);

    if (testInfo.project.name === "phone") {
      // On a phone the week is one day at a time: another day of the week has nothing on it.
      const days = page.getByRole("navigation", { name: "Дни недели" });
      await expect(days.locator('[aria-current="date"]')).toHaveCount(1);
      await days.locator("a:not([aria-current])").first().click();
      await expect(page.getByText("В этот день ничего нет")).toBeVisible();
      await expect(item).toHaveCount(0);
      await page.goBack();
    }

    await item.first().click();
    await expect(page).toHaveURL(/\/trainer\/sessions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 2, name: "Спина и плечи" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the Сегодня link brings the week back to today", async ({ trainer, client }) => {
    const page = trainer.page;
    await createSession(trainer, client.coachingId, mskAt(1, 9)); // keeps the week from being empty
    await gotoReady(page, `/trainer/schedule?date=${mskDay(21)}`);
    await page.getByRole("main").getByRole("link", { name: "Сегодня", exact: true }).click();
    await expect(page).toHaveURL(/\/trainer\/schedule$/);
    await expectAccessible(page);
  });
});

test.describe("week template and slots", () => {
  test("a trainer draws a window, saves the template and sees its slots", async ({ trainer }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    const day = mskDay(2);
    await gotoReady(page, "/trainer/schedule/template");
    await expect(page.getByText("Нарисуй рабочую неделю, слоты появятся сами.")).toBeVisible();
    await expectAccessible(page);

    await tap(page.getByRole("button", { name: "Добавить окно" }));
    await page.getByLabel("День").selectOption(String(isoWeekday(day)));
    await page.getByLabel("С", { exact: true }).fill("10:00");
    await page.getByLabel("До", { exact: true }).fill("12:00");
    await page.getByLabel("Длительность занятия").selectOption("60");
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: "Добавить", exact: true }));
    await expect(page.getByText("10:00–12:00")).toBeVisible();
    await expect(page.getByText("2 слота")).toBeVisible();
    await expect(page.getByText("Есть несохранённые изменения")).toBeVisible();

    await page.getByLabel("Открывать запись вперёд на").selectOption("1");
    await tap(page.getByRole("button", { name: "Сохранить шаблон" }));
    await expect(page.getByText("Шаблон сохранён, новых слотов: 2")).toBeVisible();
    await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
    expect(await openSlots(trainer)).toHaveLength(2);

    await gotoReady(page, "/trainer/schedule/slots");
    await expect(page.getByRole("heading", { level: 1, name: "Слоты" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Закрыть .*10:00–11:00$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Закрыть .*11:00–12:00$/ })).toBeVisible();
    await expectAccessible(page);

    // The free slot also shows on the week.
    await gotoReady(page, `/trainer/schedule?date=${day}`);
    await expect(scheduleItem(page, /Свободно.*10:00–11:00|10:00–11:00.*Свободно/)).toHaveCount(1);
    expect(errors()).toEqual([]);
  });

  test("saving the template keeps a filled window that was not added yet", async ({ trainer }) => {
    const page = trainer.page;
    const day = mskDay(2);
    await gotoReady(page, "/trainer/schedule/template");
    await tap(page.getByRole("button", { name: "Добавить окно" }));
    await page.getByLabel("День").selectOption(String(isoWeekday(day)));
    await page.getByLabel("С", { exact: true }).fill("10:00");
    await page.getByLabel("До", { exact: true }).fill("12:00");
    await page.getByLabel("Открывать запись вперёд на").selectOption("1");
    await tap(page.getByRole("button", { name: "Сохранить шаблон" }));
    await expect(page.getByText("Шаблон сохранён, новых слотов: 2")).toBeVisible();
    await expect(page.getByText("10:00–12:00")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Новое окно" })).toHaveCount(0);
    expect(await openSlots(trainer)).toHaveLength(2);

    // A window that can't go in stops the save and says why under the form.
    await tap(page.getByRole("button", { name: "Добавить окно" }));
    await page.getByLabel("День").selectOption(String(isoWeekday(day)));
    await page.getByLabel("С", { exact: true }).fill("11:00");
    await page.getByLabel("До", { exact: true }).fill("13:00");
    await tap(page.getByRole("button", { name: "Сохранить шаблон" }));
    await expect(page.getByRole("alert").filter({ hasText: "Окна в один день пересекаются" })).toBeVisible();
    expect(await openSlots(trainer)).toHaveLength(2);
  });

  test("the template refuses a window that ends before it starts and one that overlaps", async ({ trainer }) => {
    const page = trainer.page;
    await gotoReady(page, "/trainer/schedule/template");
    await tap(page.getByRole("button", { name: "Добавить окно" }));
    await page.getByLabel("С", { exact: true }).fill("12:00");
    await page.getByLabel("До", { exact: true }).fill("11:00");
    await tap(page.getByRole("button", { name: "Добавить", exact: true }));
    await expect(page.getByRole("alert").filter({ hasText: "Конец должен быть позже начала" })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("До", { exact: true }).fill("14:00");
    await tap(page.getByRole("button", { name: "Добавить", exact: true }));
    await tap(page.getByRole("button", { name: "Добавить окно" }));
    await page.getByLabel("С", { exact: true }).fill("13:00");
    await page.getByLabel("До", { exact: true }).fill("15:00");
    await tap(page.getByRole("button", { name: "Добавить", exact: true }));
    await expect(page.getByRole("alert").filter({ hasText: "Окна в один день пересекаются" })).toBeVisible();
  });

  test("a trainer closes one slot and opens it again", async ({ trainer }) => {
    const page = trainer.page;
    await openWindow(trainer, 2, 10, 11);
    await gotoReady(page, "/trainer/schedule/slots");
    await tap(page.getByRole("button", { name: /^Закрыть .*10:00–11:00$/ }));
    await expect(page.getByText("Закрыт", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: /^Открыть .*10:00–11:00$/ }));
    await expect(page.getByText("Закрыт", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Закрыть .*10:00–11:00$/ })).toBeVisible();
  });

  test("a trainer closes days for a vacation and reopens them", async ({ trainer }) => {
    const page = trainer.page;
    const day = mskDay(2);
    await openWindow(trainer, 2, 10, 12);
    await gotoReady(page, "/trainer/schedule/slots");
    await page.getByLabel("С", { exact: true }).fill(day);
    await page.getByLabel("По", { exact: true }).fill(day);
    await tap(page.getByRole("button", { name: "Закрыть дни" }));
    await expect(page.getByText("Дни закрыты")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Закрытые дни" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Закрыть .*10:00–11:00$/ })).toHaveCount(0);
    await expectAccessible(page);

    await tap(page.getByRole("button", { name: /^Открыть / }));
    await expect(page.getByText("Дни снова открыты")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Закрыть .*10:00–11:00$/ })).toBeVisible();
  });
});

test.describe("sessions", () => {
  test("the tab bar labels stay readable over the session form on a phone", async ({ trainer, client }) => {
    await gotoReady(trainer.page, `/trainer/sessions/new?coaching=${client.coachingId}`);
    await expectAccessible(trainer.page);
  });

  test("a trainer assigns a one-off session from the client's card prefill", async ({ trainer, client }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    const day = mskDay(4);
    await gotoReady(page, `/trainer/sessions/new?coaching=${client.coachingId}`);
    await expect(page.getByRole("heading", { level: 1, name: "Новое занятие" })).toBeVisible();
    await expect(page.getByLabel("Клиент")).toHaveValue(client.coachingId);
    await expectAccessible(page);
    await page.getByLabel("Дата").fill(day);
    await page.getByLabel("Начало").fill("18:30");
    await page.getByLabel("Длительность").selectOption("90");
    await page.getByLabel("Название").fill("Ноги");
    await tap(page.getByRole("button", { name: "Назначить" }));
    await expect(page.getByText("Занятие назначено, клиенту придёт сообщение")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/trainer/schedule\\?date=${day}`));
    await expect(scheduleItem(page, /18:30–20:00/)).toHaveCount(1);
    await expectAccessible(page);

    // The client has the booking at once.
    await gotoReady(client.page, "/client/sessions");
    await expect(client.page.getByRole("link", { name: /18:30.*Тренер Иван Тренеров/ })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a trainer assigns a weekly repeat and the count of sessions shows in the toast", async ({ trainer, client }) => {
    const page = trainer.page;
    const day = mskDay(1);
    const second = mskDay(3);
    await gotoReady(page, `/trainer/sessions/new?coaching=${client.coachingId}`);
    await page.getByLabel("Дата").fill(day);
    await page.getByLabel("Начало").fill("07:00");
    await tap(page.getByRole("radio", { name: "Каждую неделю" }));
    await expect(page.getByRole("checkbox", { name: weekdayName(day) })).toBeChecked();
    await page.getByRole("checkbox", { name: weekdayName(second) }).check();
    await page.getByLabel("Сколько занятий").fill("4");
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: "Назначить" }));
    await expect(page.getByText("Назначено занятий: 4. Клиенту придёт одно сообщение")).toBeVisible();
    const sessions = ok(
      await trainer.db.from("sessions").select("id, recurrence_id").eq("trainer_id", trainer.userId).eq("status", "scheduled"),
      "sessions",
    );
    expect(sessions).toHaveLength(4);
    expect(new Set(sessions.map((session) => session.recurrence_id)).size).toBe(1);

    await gotoReady(page, `/trainer/sessions/${sessions[0].id}`);
    await expect(page.getByText(/Каждую неделю: /)).toBeVisible();
    await expectAccessible(page);
  });

  test("the session form refuses a time in the past and a repeat without the first day", async ({ trainer, client }) => {
    const page = trainer.page;
    await gotoReady(page, `/trainer/sessions/new?coaching=${client.coachingId}`);
    await page.getByLabel("Дата").fill(mskDay(0));
    await page.getByLabel("Начало").fill("00:00");
    await tap(page.getByRole("button", { name: "Назначить" }));
    await expect(page.getByText("Это время уже прошло, выбери будущее")).toBeVisible();
    await expectAccessible(page);

    const day = mskDay(2);
    await page.getByLabel("Дата").fill(day);
    await tap(page.getByRole("radio", { name: "Каждую неделю" }));
    await page.getByRole("checkbox", { name: weekdayName(day) }).uncheck();
    await page.getByRole("checkbox", { name: weekdayName(mskDay(3)) }).check();
    await tap(page.getByRole("button", { name: "Назначить" }));
    await expect(page.getByText(/Отметь дни повтора вместе с днём первого занятия/)).toBeVisible();
  });

  test("a trainer with no clients is sent to invite one", async ({ trainer }) => {
    const page = trainer.page;
    await gotoReady(page, "/trainer/sessions/new");
    await expect(page.getByRole("heading", { name: "Пока некому назначить" })).toBeVisible();
    await expectAccessible(page);
    await expect(page.getByRole("link", { name: "К клиентам" })).toBeVisible();
  });

  test("a trainer moves a session to another time and the client sees the new time", async ({ trainer, client }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    const sessionId = await createSession(trainer, client.coachingId, mskAt(3, 15), { title: "Спина" });
    await gotoReady(page, `/trainer/sessions/${sessionId}`);
    await expect(page.getByText("Запланировано")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "Изменить" }).click();
    await expect(page).toHaveURL(new RegExp(`/trainer/sessions/${sessionId}/edit$`));
    await expect(page.getByRole("heading", { level: 1, name: "Изменить занятие" })).toBeVisible();
    await expect(page.getByLabel("Начало")).toHaveValue("15:00");
    await expectAccessible(page);
    await page.getByLabel("Начало").fill("17:00");
    await page.getByLabel("Название").fill("Спина и плечи");
    await tap(page.getByRole("button", { name: "Сохранить" }));
    await expect(page.getByText("Сохранено, клиенту придёт сообщение")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/trainer/sessions/${sessionId}$`));
    await expect(page.getByText(/17:00–18:00/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Спина и плечи" })).toBeVisible();

    await gotoReady(client.page, "/client/sessions");
    await expect(client.page.getByRole("link", { name: /17:00.*Тренер Иван Тренеров/ })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a trainer cancels a session with a reason, and the client sees it cancelled", async ({ trainer, client }) => {
    const page = trainer.page;
    const sessionId = await createSession(trainer, client.coachingId, mskAt(3, 15));
    await gotoReady(page, `/trainer/sessions/${sessionId}`);
    await tap(page.getByRole("button", { name: "Отменить занятие" }));
    const sheet = page.getByRole("dialog", { name: "Отменить занятие?" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    // No reason, no cancel: the client has to know why.
    await tap(sheet.getByRole("button", { name: "Отменить занятие" }));
    await expect(sheet.getByText("Напиши причину, её увидит клиент")).toBeVisible();
    await sheet.getByLabel("Причина").fill("Заболел");
    await tap(sheet.getByRole("button", { name: "Отменить занятие" }));
    await expect(page.getByText("Занятие отменено")).toBeVisible();
    await expect(page.getByText("Отменено", { exact: true })).toBeVisible();
    await expect(page.getByText("Заболел").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Отменить занятие" })).toHaveCount(0);
    await expectAccessible(page);

    const [booking] = ok(await client.db.from("bookings").select("id, status").eq("session_id", sessionId), "booking");
    expect(booking.status).toBe("cancelled");
    await gotoReady(client.page, `/client/bookings/${booking.id}`);
    await expect(client.page.getByText("Отменено").first()).toBeVisible();
    await expect(client.page.getByText("Заболел").first()).toBeVisible();
    await expectAccessible(client.page);
  });

  test("another trainer's session is not found", async ({ trainer, client, persona }) => {
    const sessionId = await createSession(trainer, client.coachingId, mskAt(3, 15));
    const stranger = await persona({ firstName: "Пётр", lastName: "Чужой" });
    const { makeTrainer } = await import("./support/personas");
    await makeTrainer(stranger);
    await gotoReady(stranger.page, `/trainer/sessions/${sessionId}`);
    await expect(stranger.page.getByRole("heading", { name: "Занятие не найдено" })).toBeVisible();
    await expectAccessible(stranger.page);
    await gotoReady(stranger.page, `/trainer/sessions/${sessionId}/edit`);
    await expect(stranger.page.getByText("Занятие не найдено").first()).toBeVisible();
  });
});

test.describe("today", () => {
  test("the trainer's Сегодня lists today's sessions and opens one", async ({ trainer, client }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    await gotoReady(page, "/trainer");
    await expect(page.getByRole("heading", { name: "Сегодня занятий нет" })).toBeVisible();
    await expectAccessible(page);

    const { sessionId, label } = await todayStart(trainer, client.coachingId);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Занятия сегодня" })).toBeVisible();
    const row = page.getByRole("link", { name: new RegExp(`Анна Клиентова.*${label}`) });
    await expect(row).toBeVisible();
    await expectAccessible(page);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/trainer/sessions/${sessionId}`));
    expect(errors()).toEqual([]);
  });
});

test.describe("attendance and waivers", () => {
  test("a trainer marks a no-show after the session and then waives the charge", async ({ trainer, client }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    const { sessionId } = await pastSession(trainer, client.coachingId);
    await gotoReady(page, `/trainer/sessions/${sessionId}`);
    const marks = page.getByRole("group", { name: "Посещение: Анна Клиентова" });
    await expect(marks.getByRole("button", { name: "Был" })).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page);

    await tap(marks.getByRole("button", { name: "Не пришёл" }));
    await expect(page.getByText("Анна Клиентова: неявка, занятие списано")).toBeVisible();
    await expect(marks.getByRole("button", { name: "Не пришёл" })).toHaveAttribute("aria-pressed", "true");

    await tap(page.getByRole("button", { name: /Анна Клиентова.*Простить/ }));
    const sheet = page.getByRole("dialog", { name: "Простить списание?" });
    await expect(sheet.getByText("Долг станет меньше на одно занятие. Отменить прощение потом нельзя.")).toBeVisible();
    await expectAccessible(page);
    await sheet.getByLabel("Причина, по желанию").fill("Предупредила заранее");
    await tap(sheet.getByRole("button", { name: "Простить" }));
    await expect(page.getByText("Списание прощено").first()).toBeVisible();
    expect(await ledgerTypes(trainer, client.coachingId)).toContain("waiver");
    expect(errors()).toEqual([]);
  });

  test("a session recorded after the fact says in its history that the client came", async ({ trainer, client }) => {
    const { sessionId, bookingId } = await pastSession(trainer, client.coachingId);
    await gotoReady(trainer.page, `/trainer/sessions/${sessionId}`);
    const history = trainer.page.getByRole("main");
    await expect(history.getByText("Отмечен приход")).toBeVisible();
    await expect(history.getByText("Запрос на запись")).toHaveCount(0);
    await gotoReady(client.page, `/client/bookings/${bookingId}`);
    await expect(client.page.getByText("Запрос на запись")).toHaveCount(0);
  });

  test("the waive link from the bot opens the waive sheet for that booking", async ({ trainer, client }) => {
    const page = trainer.page;
    const { sessionId, bookingId } = await pastSession(trainer, client.coachingId, "no_show");
    await gotoReady(page, `/trainer/sessions/${sessionId}?action=waive&booking=${bookingId}`);
    const sheet = page.getByRole("dialog", { name: "Простить списание?" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "Простить" }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await ledgerTypes(trainer, client.coachingId)).toEqual(["charge", "waiver"]);
  });

  test("marking a session that has not started is not offered", async ({ trainer, client }) => {
    const sessionId = await createSession(trainer, client.coachingId, mskAt(3, 15));
    await gotoReady(trainer.page, `/trainer/sessions/${sessionId}`);
    await expect(trainer.page.getByRole("heading", { level: 1, name: "Занятие" })).toBeVisible();
    await expect(trainer.page.getByRole("group", { name: /Посещение/ })).toHaveCount(0);
    const [booking] = ok(await trainer.db.from("bookings").select("id").eq("session_id", sessionId), "booking");
    const early = await trainer.db.rpc("mark_attendance", { p_booking_id: booking.id, p_status: "no_show" });
    expect(early.error?.message).toBe("not_started");
  });
});

test.describe("check-in by QR", () => {
  test("the trainer shows the session QR and the client checks in with its code", async ({ trainer, client }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    const sessionId = await createSession(trainer, client.coachingId, fromNow(20));
    await gotoReady(page, `/trainer/sessions/${sessionId}`);
    await tap(page.getByRole("button", { name: /QR для отметки/ }));
    const sheet = page.getByRole("dialog", { name: "QR для отметки" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("img", { name: "QR-код для отметки на занятии" })).toBeVisible();
    await expect(sheet.getByText("Пока никто")).toBeVisible();
    await expectAccessible(page);

    const [qr] = ok(await trainer.db.rpc("session_check_in_qr", { p_session_id: sessionId }), "check-in code");
    await gotoReady(client.page, `/client/checkin/${sessionId}?c=${encodeURIComponent(qr.code)}`);
    await expect(client.page.getByText("Готово, ты на занятии. Тренер видит отметку.")).toBeVisible();
    await expectAccessible(client.page);
    await expect(sheet.getByText("Анна Клиентова")).toBeVisible({ timeout: 15_000 });

    // A second scan of a fresh code is no new check-in.
    const [again] = ok(await trainer.db.rpc("session_check_in_qr", { p_session_id: sessionId }), "check-in code");
    await gotoReady(client.page, `/client/checkin/${sessionId}?c=${encodeURIComponent(again.code)}`);
    await expect(client.page.getByText("Отметка уже есть, ещё раз сканировать не нужно.")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a stale or made-up code is refused", async ({ trainer, client }) => {
    const sessionId = await createSession(trainer, client.coachingId, fromNow(20));
    await gotoReady(client.page, `/client/checkin/${sessionId}?c=000000`);
    await expect(client.page.getByText("Код устарел. Отсканируй QR ещё раз с экрана тренера.")).toBeVisible();
    await expect(client.page.getByRole("link", { name: "Мои занятия" })).toBeVisible();
    await expectAccessible(client.page);
  });

  test("the hall QR page lists the trainer's places and shows a printable QR", async ({ trainer }) => {
    const page = trainer.page;
    await gotoReady(page, "/trainer/checkin-qr");
    await expect(page.getByRole("heading", { name: "Мест пока нет" })).toBeVisible();
    await expectAccessible(page);

    ok(await trainer.db.from("locations").insert({ trainer_id: trainer.userId, name: "Зал на Лесной", address: "ул. Придуманная, 1" }), "location");
    await page.reload();
    await expect(page.getByText("Зал на Лесной")).toBeVisible();
    await tap(page.getByRole("button", { name: /Зал на Лесной/ }));
    await expect(page.getByText("Этот QR не меняется, его достаточно распечатать один раз.")).toBeVisible();
    await expectAccessible(page);
  });

  test("the hall QR checks the client in to the next session at that place", async ({ trainer, client }) => {
    const [location] = ok(
      await trainer.db.from("locations").insert({ trainer_id: trainer.userId, name: "Зал на Лесной" }).select("id"),
      "location",
    );
    ok(
      await trainer.db.rpc("create_session", {
        p_coaching_id: client.coachingId,
        p_starts_at: fromNow(20),
        p_duration_min: 60,
        p_mode: "offline",
        p_location_id: location.id,
      }),
      "session at the hall",
    );
    const token = ok(await trainer.db.rpc("location_check_in_token", { p_location_id: location.id }), "hall token");
    await gotoReady(client.page, `/client/checkin?place=${encodeURIComponent(token)}`);
    await expect(client.page.getByText("Готово, ты на занятии. Тренер видит отметку.")).toBeVisible();
    await expectAccessible(client.page);
  });
});

test.describe("group sessions", () => {
  test("a trainer creates a group session from the form and adds a participant", async ({ trainer, client }) => {
    const page = trainer.page;
    const errors = collectErrors(page);
    await gotoReady(page, `/trainer/sessions/new?date=${mskDay(3)}`);
    await tap(page.getByRole("radio", { name: "Групповое" }));
    // The group's name is required before anything is sent.
    await tap(page.getByRole("button", { name: "Создать" }));
    expect(await page.getByLabel("Название группы").evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
    await page.getByLabel("Название группы").fill("Утренняя йога");
    await page.getByLabel("Мест").fill("3");
    await page.getByLabel("Начало").fill("08:00");
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: "Создать" }));
    await expect(page.getByText("Групповое занятие создано")).toBeVisible();
    await expect(page).toHaveURL(/\/trainer\/sessions\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 2, name: "Утренняя йога" })).toBeVisible();
    await expect(page.getByText("Записано 0 из 3")).toBeVisible();
    await expect(page.getByText("Пока никто не записан")).toBeVisible();
    await expectAccessible(page);

    await tap(page.getByRole("button", { name: "Добавить участника" }));
    const sheet = page.getByRole("dialog", { name: "Добавить участника" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await expect(sheet.getByLabel("Клиент")).toHaveValue(client.coachingId);
    await tap(sheet.getByRole("button", { name: "Добавить", exact: true }));
    await expect(page.getByText("Участник добавлен")).toBeVisible();
    await expect(page.getByText("Записано 1 из 3")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the group's seats can't go below the people booked", async ({ trainer, client }) => {
    const page = trainer.page;
    const sessionId = await createGroup(trainer, "Пилатес", mskAt(3, 19), 2);
    ok(await client.db.rpc("book_group_session", { p_session_id: sessionId }), "book group");
    await gotoReady(page, `/trainer/sessions/${sessionId}`);
    await expect(page.getByText("Записано 1 из 2")).toBeVisible();
    await tap(page.getByRole("button", { name: "Места и запись" }));
    const sheet = page.getByRole("dialog", { name: "Места и запись" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await sheet.getByLabel("Мест").fill("5");
    await tap(sheet.getByRole("button", { name: /Сохранить/ }));
    await expect(page.getByText("Записано 1 из 5")).toBeVisible();
  });
});

test.describe("client groups (Pro)", () => {
  test("on Free the groups screen offers Pro", async ({ trainer }) => {
    await gotoReady(trainer.page, "/trainer/groups");
    await expect(trainer.page.getByRole("heading", { level: 1, name: "Группы" })).toBeVisible();
    await expect(trainer.page.getByRole("button", { name: "Запросить доступ" })).toBeVisible();
    await expectAccessible(trainer.page);
  });

  test("on Pro a trainer makes a group of clients and opens it", async ({ trainer, client, admin }) => {
    ok(await admin.db.rpc("admin_grant_plan", { p_user_id: trainer.userId, p_plan_code: "trainer_pro", p_reason: "e2e" }), "pro plan");
    const page = trainer.page;
    const errors = collectErrors(page);
    await gotoReady(page, "/trainer/groups");
    await expect(page.getByRole("heading", { name: "Объедини клиентов по цели" })).toBeVisible();
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: "Новая группа" }).first());
    const sheet = page.getByRole("dialog", { name: "Новая группа" });
    await expectAccessible(page);
    await sheet.getByLabel("Название").fill("Марафон осени");
    await tap(sheet.getByRole("button", { name: "Создать" }));
    await expect(page.getByText("Группа создана")).toBeVisible();
    await gotoReady(page, "/trainer/groups");
    await page.getByRole("link", { name: /Марафон осени/ }).click();
    await expect(page).toHaveURL(/\/trainer\/groups\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Марафон осени" }).first()).toBeVisible();
    await expect(page.getByText("В группе никого")).toBeVisible();
    await expectAccessible(page);

    await tap(page.getByRole("button", { name: "Добавить клиентов" }));
    const add = page.getByRole("dialog", { name: "Добавить в группу" });
    await expectAccessible(page);
    await tap(add.getByRole("button", { name: "Добавить Анна Клиентова" }));
    await expect(page.getByText("Анна Клиентова в группе")).toBeVisible();
    await expect(add.getByText("Все твои клиенты уже в этой группе")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("В группе никого")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Убрать Анна Клиентова из группы" })).toBeVisible();
    await expect(page.getByText("нет согласия на сведения о здоровье")).toHaveCount(0);

    // Without the health consent the client stays in the group, and the trainer sees why their numbers are missing.
    ok(
      await client.db.from("consents").update({ revoked_at: new Date().toISOString() }).eq("user_id", client.userId).eq("kind", "pd_health"),
      "revoke health consent",
    );
    await gotoReady(page, page.url());
    await expect(page.getByText("нет согласия на сведения о здоровье")).toBeVisible();
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });
});

function weekdayName(day: string) {
  return ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"][isoWeekday(day) - 1];
}
