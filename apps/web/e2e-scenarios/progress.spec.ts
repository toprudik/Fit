import { collectErrors } from "../e2e/support";
import { checked, exerciseId, lastMonth, mskAt, mskDay, open, solidPng, workoutLog } from "./support/diary";
import { expect, test } from "./support/fixtures";
import { makeTrainer, ok, type Persona } from "./support/personas";

/*
 * Progress: measurements, records and badges, monthly reports, photos with the face step, and what the
 * client shares with the trainer.
 */

async function weight(client: Persona, day: string, value: number) {
  ok(
    await client.db.from("measurements").insert({ client_id: client.userId, kind: "weight", value, measured_at: mskAt(day, 8), local_date: day }),
    "measurement",
  );
}

/** Picks a generated PNG in "Выбрать из галереи" and confirms there is no face on it. */
async function uploadPhoto(page: Persona["page"], date?: string) {
  // The date goes in the address, as the grid's "Добавить фото" links pass it: a date typed before hydration is lost.
  await open(page, date ? `/client/progress/photos/new?angle=front&date=${date}` : "/client/progress/photos/new", "Новое фото");
  if (date) await expect(page.getByLabel("Дата").filter({ visible: true })).toHaveValue(date);
  // Right after a fresh load the picker may not be hydrated yet, so a pick can go unnoticed: pick again.
  await expect(async () => {
    await page.locator('label:has-text("Выбрать из галереи") input[type="file"]').setInputFiles({
      name: "progress.png",
      mimeType: "image/png",
      buffer: solidPng(),
    });
    await expect(page.getByRole("img", { name: /Фото для загрузки/ })).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 45_000 });
  // Offline the face detector may not load; either way there is no face on a plain image.
  await expect(page.getByText(/Лицо не нашли|Автопоиск лица сейчас не сработал/)).toBeVisible();
  const save = page.getByRole("button", { name: "Лицо скрыто, сохранить" });
  await expect(save).toBeDisabled();
  await page.getByRole("switch", { name: "Лица на фото нет или оно скрыто" }).click();
  await expect(save).toBeEnabled();
  return save;
}

test.describe("the client's progress", () => {
  test("an empty progress tab, records, badges, compare and a month without a report", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);

    await open(page, "/client/progress", "Прогресс");
    await expect(page.getByRole("heading", { name: "Замеров пока нет" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Фото пока нет" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Цель и норма питания/ })).toContainText("Посчитай, сколько калорий и БЖУ нужно в день под твою цель");
    await expect(page.getByRole("link", { name: /Значки/ })).toContainText(/0 из \d+/);
    await expect(page.getByRole("heading", { name: "Рекорды" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Итоги месяца/ })).toHaveCount(0);
    await checked(page);

    await open(page, "/client/progress/records", "Рекорды");
    await expect(page.getByText("Рекорды появятся после первых тренировок.")).toBeVisible();
    await checked(page);

    await open(page, "/client/progress/badges", "Серии и значки");
    await expect(page.getByText("Первое занятие с тренером")).toBeVisible();
    await checked(page);

    await open(page, "/client/progress/compare", "До и после");
    await expect(page.getByText("Чтобы сравнить, нужно хотя бы два фото одного ракурса за разные даты.")).toBeVisible();
    await checked(page);

    await open(page, "/client/progress/photos", "Фото прогресса");
    await expect(page.getByRole("heading", { name: "Фото пока нет" })).toBeVisible();
    await expect(page.getByText("Фото видишь только ты. Лицо размоется на телефоне ещё до загрузки.")).toBeVisible();

    await open(page, `/client/progress/reports/${lastMonth().month}`, "Итоги месяца");
    await expect(page.getByRole("heading", { name: "За этот месяц итогов нет" })).toBeVisible();
    await checked(page);
    // The current month is not finished yet.
    await open(page, `/client/progress/reports/${mskDay().slice(0, 7)}`, "Итоги месяца");
    await expect(page.getByRole("heading", { name: "За этот месяц итогов нет" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a client adds a measurement with validation, then edits and deletes it in the history", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);
    await open(page, "/client/progress", "Прогресс");
    await page.getByRole("button", { name: "Добавить замер" }).click();
    const sheet = page.getByRole("dialog", { name: "Новый замер" });
    await expect(sheet.getByLabel("Дата").filter({ visible: true })).toHaveValue(mskDay());
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByText("Заполни хотя бы одно поле")).toBeVisible();
    await sheet.getByRole("textbox", { name: "Вес" }).fill("abc");
    await sheet.getByRole("textbox", { name: "Талия" }).fill("900");
    await sheet.getByLabel("Дата").filter({ visible: true }).fill(mskDay(1));
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByText("Введи число, например 72,5")).toBeVisible();
    await expect(sheet.getByText("Такого значения не бывает, проверь число")).toBeVisible();
    await expect(sheet.getByText("Выбери сегодняшний или прошедший день")).toBeVisible();
    await checked(page);

    await sheet.getByLabel("Дата").filter({ visible: true }).fill(mskDay());
    await sheet.getByRole("textbox", { name: "Вес" }).fill("72,5");
    await sheet.getByRole("textbox", { name: "Талия" }).fill("80");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Замер сохранён")).toBeVisible();
    await expect(page.getByText("Пока одна запись: 72,5 кг")).toBeVisible();
    await checked(page);

    await page.getByRole("link", { name: "Все замеры" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Замеры" })).toBeVisible();
    const history = page.getByRole("region", { name: "История" });
    const row = history.getByRole("button", { name: /Вес/ });
    await expect(row).toContainText("72,5 кг");
    await expect(row).toContainText("Ты");
    await expect(history.getByRole("button", { name: /Талия/ })).toContainText("80 см");
    await checked(page);

    await row.click();
    const edit = page.getByRole("dialog", { name: "Изменить замер" });
    await edit.getByRole("textbox", { name: "Значение" }).fill("71");
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await expect(history.getByRole("button", { name: /Вес/ })).toContainText("71 кг");
    // The toasts sit over the last rows on a phone, and a pointer resting on them keeps them open.
    await page.mouse.move(0, 0);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await history.getByRole("button", { name: /Талия/ }).click();
    const del = page.getByRole("dialog", { name: "Изменить замер" });
    await del.getByRole("button", { name: "Удалить" }).click();
    await del.getByRole("button", { name: "Удалить замер?" }).click();
    await expect(page.getByText("Замер удалён")).toBeVisible();
    await expect(history.getByRole("button", { name: /Талия/ })).toHaveCount(0);
    expect(errors()).toEqual([]);
  });

  test("a first workout gives a record on «Прогресс», in «Рекорды» and the «Первый рекорд» badge", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const bench = await exerciseId(client, "Жим штанги лёжа");
    await workoutLog(client, { clientId: client.userId, coachingId: null, title: "Грудь", day: mskDay(), exercise: bench.id, sets: [{ reps: 8, weight_kg: 50 }] });
    const { page } = client;

    await open(page, "/client/progress", "Прогресс");
    await expect(page.getByRole("heading", { name: "Рекорды" })).toBeVisible();
    await expect(page.getByText(bench.name).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Значки/ })).toContainText("Новый");
    await checked(page);

    await open(page, "/client/progress/records", "Рекорды");
    await expect(page.getByText(/Максимальный вес/).first()).toBeVisible();
    await expect(page.getByText("50 кг").first()).toBeVisible();
    await checked(page);

    await page.getByRole("link", { name: "Прогресс" }).first().click();
    await open(page, "/client/progress/badges", "Серии и значки");
    await expect(page.getByText("Первый рекорд")).toBeVisible();
    await expect(page.getByText(/Получен/).first()).toBeVisible();
    await expect(page.getByText(/^1 из \d+$/).first()).toBeVisible();
    await checked(page);
  });
});

test.describe("monthly reports", () => {
  test("a client opens last month's report and sends it to the trainer, who opens it", async ({ trainer, client }) => {
    const { day, month } = lastMonth();
    const [y, m] = month.split("-");
    await weight(client, `${y}-${m}-05`, 74);
    await weight(client, day, 72.4);
    const bench = await exerciseId(client, "Жим штанги лёжа");
    await workoutLog(client, { clientId: client.userId, coachingId: null, title: "Грудь", day, exercise: bench.id, sets: [{ reps: 8, weight_kg: 50 }] });

    // Not sent yet: the trainer has nothing.
    await open(trainer.page, `/trainer/clients/${client.coachingId}/reports/${month}`, "Итоги клиента");
    await expect(trainer.page.getByRole("heading", { name: "Итогов нет" })).toBeVisible();
    await checked(trainer.page);

    const { page } = client;
    const errors = collectErrors(page);
    await open(page, "/client/progress", "Прогресс");
    const entry = page.getByRole("link", { name: /Итоги месяца/ });
    await expect(entry).toContainText("занятия, рекорды и замеры");
    await entry.click();
    await expect(page).toHaveURL(new RegExp(`/client/progress/reports/${month}$`));
    await expect(page.getByText("Итоги видишь только ты. Тренеру они придут, только если ты сам их отправишь.")).toBeVisible();
    await expect(page.getByText("Тренировки в журнале")).toBeVisible();
    await expect(page.getByText("1 тренировка")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Замеры" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Новые рекорды" })).toBeVisible();
    await checked(page);

    const forward = page.getByRole("button", { name: /Иван Тренеров/ });
    await expect(forward).toContainText("Отправить");
    await forward.click();
    await expect(page.getByText("Итоги у тренера")).toBeVisible();
    await expect(forward).toContainText("Отправлено");
    expect(errors()).toEqual([]);

    await trainer.page.reload();
    await expect(trainer.page.getByText(/Клиент отправил их/)).toBeVisible();
    await expect(trainer.page.getByText("Тренировки в журнале")).toBeVisible();
    await expect(trainer.page.getByText("Итоги видишь только ты.", { exact: false })).toHaveCount(0);
    await checked(trainer.page);
  });

  test("a bad month in the address is not found", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    // The month is checked inside a Suspense boundary after the shell has streamed, so the status stays 200
    // (Next.js streaming); the screen and a noindex tag are what tell it apart.
    await client.page.goto("/client/progress/reports/2026-13");
    await expect(client.page.getByRole("heading", { name: "Такой страницы нет" })).toBeVisible();
    await expect(client.page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await checked(client.page);
  });
});

test.describe("progress photos", () => {
  test("a photo goes through the face step to the grid; a second set in the month hits the Free limit", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await open(page, "/client/progress/photos", "Фото прогресса");
    await page.getByRole("link", { name: "Добавить фото" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Новое фото" })).toBeVisible();
    await expect(page.getByText("Оригинал останется на телефоне. Загрузим только копию, где лицо уже размыто.")).toBeVisible();
    await checked(page);

    const save = await uploadPhoto(page);
    await expect(page.getByRole("radio", { name: "Размыть" })).toBeVisible();
    await checked(page);
    await save.click();
    await expect(page.getByText("Фото сохранено")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/progress\/photos$/);
    await expect(page.getByRole("img", { name: /^Спереди, / })).toBeVisible();
    await expect(page.getByText("Фото видишь только ты.")).toBeVisible();
    await checked(page);

    await page.getByRole("button", { name: /Спереди, / }).click();
    const sheet = page.getByRole("dialog", { name: /Спереди, / });
    await expect(sheet.getByRole("link", { name: "Переснять" })).toBeVisible();
    await checked(page);
    await page.keyboard.press("Escape");

    const second = await uploadPhoto(page, mskDay(-3));
    await second.click();
    await expect(page.getByRole("alert").filter({ hasText: "В бесплатном тарифе можно начать один новый комплект фото в месяц" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Про Premium" })).toHaveAttribute("href", "/settings/plan");
  });

  test("with Premium two dates of one angle open «До и после», and the photo can be deleted", async ({ persona, admin }) => {
    const client = await persona({ firstName: "Вера" });
    ok(await admin.db.rpc("admin_grant_plan", { p_user_id: client.userId, p_plan_code: "client_premium", p_reason: "e2e photos" }), "premium");
    await weight(client, mskDay(-10), 70);
    await weight(client, mskDay(), 68.5);
    const { page } = client;
    await (await uploadPhoto(page, mskDay(-10))).click();
    await expect(page.getByText("Фото сохранено")).toBeVisible();
    await (await uploadPhoto(page)).click();
    await expect(page.getByText("Фото сохранено")).toBeVisible();

    await expect(page.getByRole("link", { name: "Сравнить до и после" })).toBeVisible();
    await page.getByRole("link", { name: "Сравнить до и после" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "До и после" })).toBeVisible();
    await expect(page.getByRole("img", { name: /^До, / })).toBeVisible();
    await expect(page.getByRole("img", { name: /^После, / })).toBeVisible();
    await expect(page.getByText("Вес: было 70 кг, стало 68,5 кг")).toBeVisible();
    await page.getByRole("slider", { name: "Граница между фото" }).fill("30");
    await checked(page);

    await open(page, "/client/progress/photos", "Фото прогресса");
    await page.getByRole("button", { name: /Спереди, / }).first().click();
    const sheet = page.getByRole("dialog", { name: /Спереди, / });
    await sheet.getByRole("button", { name: "Удалить фото" }).click();
    await sheet.getByRole("button", { name: "Удалить фото насовсем?" }).click();
    await expect(page.getByText("Фото удалено")).toBeVisible();
    await expect(page.getByRole("img", { name: /^Спереди, / })).toHaveCount(1);
  });
});

test.describe("what the trainer sees", () => {
  test("sharing switches decide the trainer's progress tab: measurements, photos and own workouts", async ({ trainer, client }) => {
    await weight(client, mskDay(-1), 66.2);
    const bench = await exerciseId(client, "Жим штанги лёжа");
    await workoutLog(client, { clientId: client.userId, coachingId: null, title: "Сама в зале", day: mskDay(-1), exercise: bench.id, sets: [{ reps: 5, weight_kg: 30 }] });
    await workoutLog(trainer, {
      clientId: client.userId,
      coachingId: client.coachingId,
      title: "С тренером в зале",
      day: mskDay(-1),
      exercise: bench.id,
      sets: [{ reps: 5, weight_kg: 35 }],
    });
    const tpage = trainer.page;
    const progress = `/trainer/clients/${client.coachingId}/progress`;

    // Defaults: measurements and workouts open, photos closed.
    await open(tpage, progress);
    await expect(tpage.getByText("66,2 кг").first()).toBeVisible();
    await expect(tpage.getByRole("heading", { name: "Клиент не открыл доступ к фото" })).toBeVisible();
    await checked(tpage);
    await open(tpage, `/trainer/clients/${client.coachingId}/workouts`);
    await expect(tpage.getByRole("link", { name: /Сама в зале/ })).toBeVisible();

    const { page } = client;
    const errors = collectErrors(page);
    await open(page, `/client/trainers/${client.coachingId}/sharing`, "Что видит тренер");
    await expect(page.getByText("Открыто тренеру Иван")).toBeVisible();
    const measurements = page.getByRole("switch", { name: "Замеры" });
    const photos = page.getByRole("switch", { name: "Фото прогресса" });
    const workouts = page.getByRole("switch", { name: "Свои тренировки" });
    await expect(measurements).toBeChecked();
    await expect(photos).not.toBeChecked();
    await expect(workouts).toBeChecked();
    await expect(page.getByRole("switch", { name: "Анкета" })).not.toBeChecked();
    await checked(page);

    await measurements.click();
    await expect(measurements).not.toBeChecked();
    await photos.click();
    await expect(photos).toBeChecked();
    await workouts.click();
    await expect(workouts).not.toBeChecked();
    // Each switch saves through its own server action; let the last one land before reloading.
    await page.waitForLoadState("networkidle");
    await expect
      .poll(async () => ok(await client.db.from("data_shares").select("measurements, photos, workouts").eq("coaching_id", client.coachingId).single(), "shares"), { timeout: 10_000 })
      .toEqual({ measurements: false, photos: true, workouts: false });
    await page.reload();
    await expect(page.getByRole("switch", { name: "Замеры" })).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Фото прогресса" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Свои тренировки" })).not.toBeChecked();
    expect(errors()).toEqual([]);

    await open(tpage, progress);
    await expect(tpage.getByRole("heading", { name: "Клиент закрыл замеры" })).toBeVisible();
    await expect(tpage.getByText("66,2 кг")).toHaveCount(0);
    await expect(tpage.getByRole("button", { name: "Добавить замер" })).toHaveCount(0);
    await expect(tpage.getByText("Клиент ещё не добавил фото")).toBeVisible();
    await checked(tpage);
    await open(tpage, `/trainer/clients/${client.coachingId}/workouts`);
    await expect(tpage.getByText("Клиент закрыл свои тренировки. Тебе видны только те, что записаны с тобой.")).toBeVisible();
    await expect(tpage.getByRole("link", { name: /Сама в зале/ })).toHaveCount(0);
    await expect(tpage.getByRole("link", { name: /С тренером в зале/ })).toBeVisible();

    // The photos page tells the client who sees them.
    await open(page, "/client/progress/photos", "Фото прогресса");
    await expect(page.getByRole("heading", { name: "Фото пока нет" })).toBeVisible();
  });

  test("the trainer adds a measurement for the client; the client sees who added it", async ({ trainer, client }) => {
    const { page } = trainer;
    await open(page, `/trainer/clients/${client.coachingId}/progress`);
    await expect(page.getByText("Добавь первый замер клиента, и здесь появится график.")).toBeVisible();
    await page.getByRole("button", { name: "Добавить замер" }).click();
    const sheet = page.getByRole("dialog", { name: "Новый замер" });
    await sheet.getByRole("textbox", { name: "Вес" }).fill("80,4");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Замер сохранён")).toBeVisible();
    await expect(page.getByText("Пока одна запись: 80,4 кг")).toBeVisible();
    await checked(page);

    await open(client.page, "/client/progress/measurements", "Замеры");
    const row = client.page.getByRole("region", { name: "История" }).getByText("Тренер Иван");
    await expect(row).toBeVisible();
    // Only the author edits an entry.
    await expect(client.page.getByRole("region", { name: "История" }).getByRole("button")).toHaveCount(0);
  });

  test("another trainer sees nothing of the client's progress", async ({ client, persona }) => {
    await weight(client, mskDay(), 60.1);
    const stranger = await persona({ firstName: "Чужой" });
    await makeTrainer(stranger);
    await open(stranger.page, `/trainer/clients/${client.coachingId}/progress`);
    await expect(stranger.page.getByText("60,1 кг")).toHaveCount(0);
    await open(stranger.page, `/client/trainers/${client.coachingId}/sharing`);
    await expect(stranger.page.getByRole("switch", { name: "Замеры" })).toHaveCount(0);
  });
});
