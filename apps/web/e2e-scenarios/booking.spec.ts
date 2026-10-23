import type { Page } from "@playwright/test";
import { collectErrors, expectAccessible as axe, settle } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import { ok, type Persona } from "./support/personas";
import {
  bookingsOf,
  createGroup,
  createPass,
  createSession,
  fromNow,
  gotoReady,
  ledgerTypes,
  mskAt,
  mskDay,
  openSlots,
  openWindow,
  pastSession,
  tap,
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
 * Booking from the client's side and the trainer's answer (screens.md §4.2 steps 6–9, §4.3, PRD wave-1
 * 2.6.4–2.6.6): a slot booked on a pass or sent as a request, the request confirmed or declined, a booking
 * moved and cancelled in time or late, group sessions with their waitlist.
 */

/** Opens /client/book on the day of the slot `days` from today and picks the slot that starts at `time`. */
async function pickSlot(page: Page, coachingId: string, days: number, time: string) {
  await gotoReady(page, `/client/book?coaching=${coachingId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Запись на занятие" })).toBeVisible();
  const day = new Date(`${mskDay(days)}T12:00:00Z`);
  const chip = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(day);
  await tap(page.getByRole("navigation", { name: "Дни" }).getByRole("button", { name: chip, exact: true }));
  await tap(page.getByRole("button", { name: new RegExp(`^${time}–`) }));
}

async function onlyBooking(client: Persona) {
  const rows = ok(await client.db.from("bookings").select("id, status, session_id").eq("client_id", client.userId), "bookings");
  expect(rows).toHaveLength(1);
  return rows[0];
}

test.describe("booking a slot", () => {
  test("with an active pass the booking is confirmed at once", async ({ trainer, client }) => {
    const page = client.page;
    const errors = collectErrors(page);
    await openWindow(trainer, 3, 10, 12);
    await createPass(trainer, client.coachingId, 10, "10 занятий");

    await gotoReady(page, "/client");
    await expect(page.getByRole("heading", { name: "Ближайших занятий нет" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("main").getByRole("link", { name: "Записаться" }).click();
    await expect(page).toHaveURL(/\/client\/book/);

    await pickSlot(page, client.coachingId, 3, "10:00");
    const sheet = page.getByRole("dialog", { name: "Записаться на занятие?" });
    await expect(sheet.getByText("Оплата по абонементу «10 занятий», после записи останется занятий: 9.")).toBeVisible();
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "Записаться" }));
    await expect(page.getByText("Запись подтверждена").first()).toBeVisible();
    await expect(page).toHaveURL(/\/client\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Подтверждено")).toBeVisible();
    await expect(page.getByText(/Бесплатно отменить можно до/)).toBeVisible();
    await expectAccessible(page);
    expect((await onlyBooking(client)).status).toBe("confirmed");

    // The home screen and the sessions list show the booking; the slot is gone from the trainer's free ones.
    await gotoReady(page, "/client");
    await expect(page.getByRole("heading", { name: "Ближайшее занятие" })).toBeVisible();
    await expect(page.getByRole("link", { name: /10:00.*Тренер Иван Тренеров/ })).toBeVisible();
    // Booking once more stays on the home screen (QA U2).
    await expect(page.getByRole("main").getByRole("link", { name: "Записаться" })).toHaveAttribute("href", "/client/book");
    await expectAccessible(page);
    await gotoReady(page, "/client/sessions");
    await expect(page.getByRole("link", { name: /10:00.*Тренер Иван Тренеров/ })).toBeVisible();
    await expectAccessible(page);
    expect(await openSlots(trainer)).toHaveLength(1);
    expect(errors()).toEqual([]);
  });

  test("without a pass the booking is a request the trainer confirms", async ({ trainer, client }) => {
    const page = client.page;
    const errors = collectErrors(page);
    await openWindow(trainer, 3, 10, 12);
    await pickSlot(page, client.coachingId, 3, "11:00");
    const sheet = page.getByRole("dialog", { name: "Записаться на занятие?" });
    await expect(sheet.getByText(/поэтому это будет запрос/)).toBeVisible();
    await tap(sheet.getByRole("button", { name: "Отправить запрос" }));
    await expect(page.getByText("Запрос отправлен тренеру")).toBeVisible();
    await expect(page.getByText("Запрос", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Ответа от тренера пока нет/)).toBeVisible();
    await expectAccessible(page);
    const booking = await onlyBooking(client);
    expect(booking.status).toBe("requested");

    await gotoReady(page, "/client/sessions");
    await tap(page.getByRole("radio", { name: "Запросы" }));
    await expect(page.getByRole("link", { name: /11:00.*Тренер Иван Тренеров/ })).toBeVisible();
    await expectAccessible(page);

    // The trainer finds it on Сегодня and in the requests and confirms it.
    const coach = trainer.page;
    await gotoReady(coach, "/trainer/schedule");
    await expect(coach.getByRole("link", { name: "Запросы: 1" })).toBeVisible();
    await gotoReady(coach, "/trainer/requests");
    await expect(coach.getByRole("heading", { level: 1, name: "Запросы на запись" })).toBeVisible();
    await expectAccessible(coach);
    await coach.getByRole("link", { name: /Анна Клиентова/ }).click();
    await expect(coach).toHaveURL(new RegExp(`/trainer/requests/${booking.id}$`));
    await expect(coach.getByRole("heading", { level: 1, name: "Запрос на запись" })).toBeVisible();
    await expect(coach.getByText(/при списании занятие уйдёт в долг/)).toBeVisible();
    await expectAccessible(coach);
    await tap(coach.getByRole("button", { name: "Подтвердить", exact: true }));
    await expect(coach.getByText("Запись подтверждена")).toBeVisible();
    await expect(coach).toHaveURL(/\/trainer\/requests$/);
    await expect(coach.getByRole("heading", { name: "Запросов нет" })).toBeVisible();

    await gotoReady(page, `/client/bookings/${booking.id}`);
    await expect(page.getByText("Подтверждено")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the trainer confirms a request right from the list", async ({ trainer, client }) => {
    await openWindow(trainer, 3, 10, 11);
    const [slot] = await openSlots(trainer);
    const [request] = ok(await client.db.rpc("book_slot", { p_slot_id: slot.id }), "book slot");
    expect(request.status).toBe("requested");

    const coach = trainer.page;
    await gotoReady(coach, "/trainer/requests");
    await expect(coach.getByText("Без абонемента запись уйдёт в долг.", { exact: false })).toBeVisible();
    await expectAccessible(coach);
    await tap(coach.getByRole("button", { name: /^Подтвердить запись: / }));
    await expect(coach.getByText("Запись подтверждена")).toBeVisible();
    await expect(coach.getByRole("heading", { name: "Запросов нет" })).toBeVisible();
    const booking = ok(await client.db.from("bookings").select("status").eq("id", request.booking_id), "booking");
    expect(booking[0].status).toBe("confirmed");
  });

  test("the trainer declines a request with a reason and the time is free again", async ({ trainer, client }) => {
    await openWindow(trainer, 3, 10, 11);
    const [slot] = await openSlots(trainer);
    const [request] = ok(await client.db.rpc("book_slot", { p_slot_id: slot.id }), "book slot");
    expect(request.status).toBe("requested");

    const coach = trainer.page;
    await gotoReady(coach, `/trainer/requests/${request.booking_id}`);
    await tap(coach.getByRole("button", { name: "Отклонить" }));
    const sheet = coach.getByRole("dialog", { name: "Отклонить запрос?" });
    await expect(sheet).toBeVisible();
    await expectAccessible(coach);
    await sheet.getByLabel("Причина").fill("В это время я в отпуске");
    await tap(sheet.getByRole("button", { name: "Отклонить" }));
    await expect(coach.getByText("Запрос отклонён")).toBeVisible();

    const page = client.page;
    await gotoReady(page, `/client/bookings/${request.booking_id}`);
    await expect(page.getByText("Отклонено")).toBeVisible();
    await expect(page.getByText("В это время я в отпуске", { exact: true })).toBeVisible();
    await expectAccessible(page);
    expect(await openSlots(trainer)).toHaveLength(1);

    // A request already answered is not found again.
    await gotoReady(coach, `/trainer/requests/${request.booking_id}`);
    await expect(coach.getByRole("heading", { name: "Запрос не найден" })).toBeVisible();
  });

  test("the client withdraws a request before the trainer answers", async ({ trainer, client }) => {
    await openWindow(trainer, 3, 10, 11);
    const [slot] = await openSlots(trainer);
    const [request] = ok(await client.db.rpc("book_slot", { p_slot_id: slot.id }), "book slot");
    const page = client.page;
    await gotoReady(page, `/client/bookings/${request.booking_id}`);
    await tap(page.getByRole("button", { name: "Отозвать запрос" }));
    const sheet = page.getByRole("dialog", { name: "Отозвать запрос?" });
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "Отозвать" }));
    await expect(page.getByText("Запрос отозван")).toBeVisible();
    await gotoReady(trainer.page, "/trainer/requests");
    await expect(trainer.page.getByRole("heading", { name: "Запросов нет" })).toBeVisible();
  });

  test("a slot someone else took is refused with a clear message", async ({ trainer, client, persona }) => {
    const other = await persona({ firstName: "Борис", lastName: "Второй" });
    const { joinTrainer } = await import("./support/personas");
    const otherCoaching = await joinTrainer(other, trainer);
    await createPass(trainer, otherCoaching);
    await openWindow(trainer, 3, 10, 11);
    const page = client.page;
    await pickSlot(page, client.coachingId, 3, "10:00");
    const sheet = page.getByRole("dialog", { name: "Записаться на занятие?" });
    await expect(sheet.getByRole("button", { name: "Отправить запрос" })).toBeVisible();
    const [slot] = await openSlots(trainer);
    ok(await other.db.rpc("book_slot", { p_slot_id: slot.id }), "the other client books first");
    await tap(sheet.getByRole("button", { name: "Отправить запрос" }));
    await expect(sheet.getByText("Это время уже заняли, выбери другое.")).toBeVisible();
    await expectAccessible(page);
  });

  test("a slot the client took in another tab leads to that booking (QA B12)", async ({ trainer, client }) => {
    await createPass(trainer, client.coachingId);
    await openWindow(trainer, 3, 10, 11);
    const page = client.page;
    await pickSlot(page, client.coachingId, 3, "10:00");
    const sheet = page.getByRole("dialog", { name: "Записаться на занятие?" });
    await expect(sheet.getByRole("button", { name: "Записаться" })).toBeVisible();
    const [slot] = await openSlots(trainer);
    const [booked] = ok(await client.db.rpc("book_slot", { p_slot_id: slot.id }), "the other tab books first");
    await tap(sheet.getByRole("button", { name: "Записаться" }));
    await expect(page.getByText("На это время у тебя уже есть запись.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/client/bookings/${booked.booking_id}$`));
    await expect(page.getByText("Это время уже заняли")).toHaveCount(0);
  });

  test("a client with no trainer and a trainer with no slots both get an empty state", async ({ trainer, client, persona }) => {
    const loner = await persona({ firstName: "Вера", lastName: "Одна" });
    await gotoReady(loner.page, "/client/book");
    await expect(loner.page.getByRole("heading", { name: "Пока не к кому записаться" })).toBeVisible();
    // Not a dead end: the trainer's code is one tap away (QA T2).
    await expect(loner.page.getByRole("main").getByRole("link", { name: "Ввести код тренера" })).toHaveAttribute("href", "/join");
    await expectAccessible(loner.page);

    void trainer;
    await gotoReady(client.page, `/client/book?coaching=${client.coachingId}`);
    await expect(client.page.getByRole("heading", { name: "У тренера нет свободных слотов на 2 недели" })).toBeVisible();
    await expectAccessible(client.page);
  });
});

test("a day chip answers the keyboard and a plain click once the page is ready (QA 23.10)", async ({ trainer, client }) => {
  await openWindow(trainer, 3, 10, 12);
  const page = client.page;
  await gotoReady(page, `/client/book?coaching=${client.coachingId}`);
  const days = page.getByRole("navigation", { name: "Дни" }).getByRole("button");
  await tap(days.first());
  const last = days.last();
  await last.focus();
  await page.keyboard.press("Enter");
  await expect(last).toHaveAttribute("aria-pressed", "true");
  await days.first().evaluate((element: HTMLElement) => element.click());
  await expect(days.first()).toHaveAttribute("aria-pressed", "true");
});

test.describe("moving and cancelling a booking", () => {
  test("the client moves a booking to another free slot in time", async ({ trainer, client }) => {
    await openWindow(trainer, 3, 10, 12);
    await createPass(trainer, client.coachingId);
    const [first] = await openSlots(trainer);
    const [booked] = ok(await client.db.rpc("book_slot", { p_slot_id: first.id }), "book slot");
    expect(booked.status).toBe("confirmed");

    const page = client.page;
    const errors = collectErrors(page);
    await gotoReady(page, `/client/bookings/${booked.booking_id}`);
    await page.getByRole("link", { name: "Перенести" }).click();
    await expect(page).toHaveURL(new RegExp(`/client/bookings/${booked.booking_id}/reschedule$`));
    await expect(page.getByRole("heading", { level: 1, name: "Перенос записи" })).toBeVisible();
    await expect(page.getByText(/^Сейчас: /)).toBeVisible();
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: /^11:00–/ }));
    const sheet = page.getByRole("dialog", { name: "Перенести на это время?" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "Перенести" }));
    await expect(page.getByText("Запись перенесена")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByText("11:00–12:00").first()).toBeVisible();

    const rows = ok(await client.db.from("bookings").select("status").eq("client_id", client.userId), "bookings");
    expect(rows.map((row) => row.status).sort()).toEqual(["confirmed", "rescheduled"]);
    // The new booking's history starts with the one it was moved from (QA 23.10).
    await page.reload();
    await expect(page.getByText("Запись перенесена")).toBeVisible();

    // The old move link (system "Back") says the booking was moved and leads to the new one (QA B6).
    const moved = page.url();
    await gotoReady(page, `/client/bookings/${booked.booking_id}/reschedule`);
    await expect(page.getByRole("heading", { name: "Эту запись уже перенесли" })).toBeVisible();
    await expect(page.getByText(/Бесплатная отмена закончилась/)).toHaveCount(0);
    await expectAccessible(page);
    await tap(page.getByRole("link", { name: "К новой записи" }));
    await expect(page).toHaveURL(moved);
    expect(errors()).toEqual([]);
  });

  test("the client cancels in time with a reason and nothing is charged", async ({ trainer, client }) => {
    await createPass(trainer, client.coachingId, 10, "10 занятий");
    const sessionId = await createSession(trainer, client.coachingId, mskAt(3, 15));
    const [booking] = await bookingsOf(trainer, sessionId);
    const page = client.page;
    await gotoReady(page, `/client/bookings/${booking.id}`);
    await expect(page.getByText(/Бесплатно отменить можно до/)).toBeVisible();
    await tap(page.getByRole("button", { name: "Отменить запись" }));
    const sheet = page.getByRole("dialog", { name: "Отменить запись?" });
    await expect(sheet.getByText("Время освободится, ничего не спишется.")).toBeVisible();
    await sheet.getByRole("radio", { name: "Работа" }).check();
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "Отменить", exact: true }));
    await expect(page.getByText("Запись отменена")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/sessions$/);

    const [after] = await bookingsOf(trainer, sessionId);
    expect(after.status).toBe("cancelled");
    expect(await ledgerTypes(trainer, client.coachingId)).not.toContain("charge");
  });

  test("a late cancel warns about the charge, then the trainer waives it", async ({ trainer, client }) => {
    await createPass(trainer, client.coachingId, 10, "10 занятий");
    const sessionId = await createSession(trainer, client.coachingId, fromNow(300));
    const [booking] = await bookingsOf(trainer, sessionId);
    const page = client.page;
    const errors = collectErrors(page);
    await gotoReady(page, `/client/bookings/${booking.id}`);
    await expect(page.getByText(/Бесплатная отмена закончилась/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Перенести" })).toHaveCount(0);
    await tap(page.getByRole("button", { name: "Отменить со списанием" }));
    const sheet = page.getByRole("dialog", { name: "Отменить со списанием?" });
    await expect(sheet.getByText(/Бесплатно отменить можно было до .*Сейчас при отмене спишется 1 занятие\./)).toBeVisible();
    await expect(sheet.getByText(/Спишется из «10 занятий», останется занятий: 9\./)).toBeVisible();
    await sheet.getByRole("radio", { name: "Болею" }).check();
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "Отменить и списать" }));
    await expect(page.getByText("Запись отменена, 1 занятие списано")).toBeVisible();

    const [after] = await bookingsOf(trainer, sessionId);
    expect(after.status).toBe("late_cancelled");
    await gotoReady(page, `/client/bookings/${booking.id}`);
    await expect(page.getByText("Поздняя отмена").first()).toBeVisible();
    await expect(page.getByText("Болею", { exact: true })).toBeVisible();

    // The bot's "Простить" button lands here.
    const coach = trainer.page;
    await gotoReady(coach, `/trainer/sessions/${sessionId}?action=waive&booking=${booking.id}`);
    const waive = coach.getByRole("dialog");
    await expect(waive).toBeVisible();
    await expectAccessible(coach);
    await tap(waive.getByRole("button", { name: "Простить" }));
    await expect(coach.getByRole("dialog")).toHaveCount(0);
    expect((await ledgerTypes(trainer, client.coachingId)).filter((type) => type === "charge" || type === "waiver")).toEqual(["charge", "waiver"]);
    await page.reload();
    await expect(page.getByText("Списание прощено")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a late cancel with no pass goes to debt", async ({ trainer, client }) => {
    const sessionId = await createSession(trainer, client.coachingId, fromNow(300));
    const [booking] = await bookingsOf(trainer, sessionId);
    const page = client.page;
    await gotoReady(page, `/client/bookings/${booking.id}`);
    await tap(page.getByRole("button", { name: "Отменить со списанием" }));
    const sheet = page.getByRole("dialog", { name: "Отменить со списанием?" });
    await expect(sheet.getByText(/Сейчас при отмене спишется 1 занятие\./)).toBeVisible();
    await tap(sheet.getByRole("button", { name: "Отменить и списать" }));
    await expect(page.getByText("Запись отменена, 1 занятие списано")).toBeVisible();
    await gotoReady(page, "/client");
    await expect(page.getByRole("link", { name: /Долг.*Иван Тренеров.*1 занятие/ })).toBeVisible();
    await expectAccessible(page);
  });

  test("a past session shows under Прошедшие with its status", async ({ trainer, client }) => {
    const { bookingId } = await pastSession(trainer, client.coachingId);
    const page = client.page;
    await gotoReady(page, "/client/sessions");
    await expect(page.getByRole("heading", { name: "Записей нет" })).toBeVisible();
    await tap(page.getByRole("radio", { name: "Прошедшие" }));
    const row = page.getByRole("link", { name: /Тренер Иван Тренеров/ });
    await expect(row).toBeVisible();
    await expectAccessible(page);
    await row.click();
    await expect(page).toHaveURL(new RegExp(`/client/bookings/${bookingId}$`));
    await expect(page.getByText("Проведено").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Отменить/ })).toHaveCount(0);
  });

  test("another client's booking is not found", async ({ trainer, client, persona }) => {
    const sessionId = await createSession(trainer, client.coachingId, mskAt(3, 15));
    const [booking] = await bookingsOf(trainer, sessionId);
    const stranger = await persona({ firstName: "Глеб", lastName: "Посторонний" });
    await gotoReady(stranger.page, `/client/bookings/${booking.id}`);
    await expect(stranger.page.getByRole("heading", { name: "Запись не найдена" })).toBeVisible();
    await expectAccessible(stranger.page);
  });
});

test.describe("group sessions and the waitlist", () => {
  test("a client books a seat in an open group from the booking screen", async ({ trainer, client }) => {
    await createPass(trainer, client.coachingId);
    await createGroup(trainer, "Утренняя йога", mskAt(3, 8), 3);
    const page = client.page;
    const errors = collectErrors(page);
    await gotoReady(page, `/client/book?coaching=${client.coachingId}`);
    const row = page.getByRole("button", { name: /08:00–09:00, Утренняя йога.*свободно 3 из 3/ });
    await expect(row).toBeVisible();
    await expectAccessible(page);
    await tap(row);
    const sheet = page.getByRole("dialog", { name: "Записаться на «Утренняя йога»?" });
    await expect(sheet).toBeVisible();
    await tap(sheet.getByRole("button", { name: "Записаться" }));
    await expect(page.getByText("Запись подтверждена").first()).toBeVisible();
    await expect(page).toHaveURL(/\/client\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 2, name: "Утренняя йога" })).toBeVisible();

    await gotoReady(page, `/client/book?coaching=${client.coachingId}`);
    await expect(page.getByRole("link", { name: /Утренняя йога.*ты в списке/ })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a full group puts the client on the waitlist, and a freed seat is offered and taken", async ({ trainer, client, persona }) => {
    const { joinTrainer } = await import("./support/personas");
    const first = await persona({ firstName: "Борис", lastName: "Первый" });
    const firstCoaching = await joinTrainer(first, trainer);
    await createPass(trainer, firstCoaching);
    await createPass(trainer, client.coachingId);
    const sessionId = await createGroup(trainer, "Пилатес", mskAt(3, 19), 2);
    const second = await persona({ firstName: "Дина", lastName: "Вторая" });
    const secondCoaching = await joinTrainer(second, trainer);
    ok(await trainer.db.rpc("add_group_participant", { p_session_id: sessionId, p_coaching_id: firstCoaching }), "first seat");
    ok(await trainer.db.rpc("add_group_participant", { p_session_id: sessionId, p_coaching_id: secondCoaching }), "second seat");

    const page = client.page;
    const errors = collectErrors(page);
    await gotoReady(page, `/client/book?coaching=${client.coachingId}`);
    const row = page.getByRole("button", { name: /Пилатес.*мест нет, можно встать в очередь/ });
    await expect(row).toBeVisible();
    await tap(row);
    const sheet = page.getByRole("dialog", { name: "В лист ожидания на «Пилатес»?" });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await tap(sheet.getByRole("button", { name: "В лист ожидания" }));
    await expect(page.getByText("Ты в очереди, место 1")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/waitlist\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Ты в очереди" })).toBeVisible();
    await expect(page.getByText(/Твоё место в очереди: 1\./)).toBeVisible();
    await expectAccessible(page);
    const entryUrl = page.url();
    // The home screen keeps the place in line in view.
    await gotoReady(page, "/client");
    await expect(page.getByRole("link", { name: /Ты в очереди, место 1/ })).toBeVisible();

    // The trainer sees the queue on the session; a participant leaves and the seat goes to the queue.
    const coach = trainer.page;
    await gotoReady(coach, `/trainer/sessions/${sessionId}`);
    await expect(coach.getByText("Лист ожидания")).toBeVisible();
    await expect(coach.getByText(/Анна Клиентова/).first()).toBeVisible();
    await expectAccessible(coach);
    const [taken] = ok(await first.db.from("bookings").select("id").eq("session_id", sessionId).eq("client_id", first.userId), "seat");
    ok(await first.db.rpc("cancel_my_booking", { p_booking_id: taken.id }), "first leaves");

    await gotoReady(page, "/client");
    const offer = page.getByRole("link", { name: /Для тебя освободилось место.*Место ждёт тебя до/ });
    await expect(offer).toBeVisible();
    await expectAccessible(page);
    await tap(offer);
    await expect(page).toHaveURL(entryUrl);
    await expect(page.getByRole("heading", { name: "Для тебя освободилось место" })).toBeVisible();
    await expectAccessible(page);
    await tap(page.getByRole("button", { name: "Занять место" }));
    await expect(page).toHaveURL(/\/client\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Подтверждено")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the client leaves the waitlist", async ({ trainer, client, persona }) => {
    const { joinTrainer } = await import("./support/personas");
    const first = await persona({ firstName: "Борис", lastName: "Первый" });
    const firstCoaching = await joinTrainer(first, trainer);
    const sessionId = await createGroup(trainer, "Пилатес", mskAt(3, 19), 2);
    ok(await trainer.db.rpc("add_group_participant", { p_session_id: sessionId, p_coaching_id: firstCoaching }), "seat");
    ok(await trainer.db.rpc("add_group_participant", { p_session_id: sessionId, p_coaching_id: client.coachingId }), "seat");
    void client;
    const third = await persona({ firstName: "Дина", lastName: "Третья" });
    await joinTrainer(third, trainer);
    const [entry] = ok(await third.db.rpc("join_waitlist", { p_session_id: sessionId }), "join waitlist");
    const page = third.page;
    await gotoReady(page, `/client/waitlist/${entry.entry_id}`);
    await tap(page.getByRole("button", { name: "Выйти из очереди" }));
    await expect(page.getByText("Готово, тебя больше нет в очереди")).toBeVisible();
    await gotoReady(page, `/client/waitlist/${entry.entry_id}`);
    await expect(page.getByText("Тебя нет в этой очереди.")).toBeVisible();
    await expectAccessible(page);
  });

  test("an unknown waitlist entry is not found", async ({ client }) => {
    await gotoReady(client.page, "/client/waitlist/00000000-0000-4000-8000-000000000000");
    await expect(client.page.getByRole("heading", { name: "Место в очереди не найдено" })).toBeVisible();
    await expectAccessible(client.page);
  });
});
