import { collectErrors } from "../e2e/support";
import { checked, pick, exerciseId, mskDay, open, workoutLog } from "./support/diary";
import { expect, test } from "./support/fixtures";
import { makeTrainer, ok } from "./support/personas";

/*
 * Workouts: the client's own logs, the trainer's library, templates, logs for a client and homework with
 * the client's mark.
 */

test.describe("the client's workouts", () => {
  test("a client logs a workout with validation, opens it, edits it and deletes it", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);

    await open(page, "/client/diary", "Дневник");
    await expect(page.getByRole("heading", { name: "Запиши первую тренировку" })).toBeVisible();
    await page.getByRole("link", { name: "Записать тренировку" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Новая тренировка" })).toBeVisible();
    await expect(page.getByLabel("Дата").filter({ visible: true })).toHaveValue(mskDay());
    await checked(page);

    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Добавь хотя бы одно упражнение")).toBeVisible();

    await page.getByRole("button", { name: "Добавить упражнение" }).click();
    const picker = page.getByRole("dialog", { name: "Выбери упражнение" });
    await picker.getByRole("searchbox", { name: "Найти упражнение" }).fill("абракадабра");
    await expect(picker.getByText("Ничего не нашлось. Попробуй другое слово.")).toBeVisible();
    await picker.getByRole("searchbox", { name: "Найти упражнение" }).fill("Жим штанги лёжа");
    await picker.getByRole("button", { name: /^Жим штанги лёжа/ }).first().click();
    await expect(picker).toHaveCount(0);

    const block = page.getByRole("region", { name: "Жим штанги лёжа" });
    await expect(block.getByText("Раньше этого упражнения не было")).toBeVisible();
    await block.getByRole("textbox", { name: "Подход 1, Повторы" }).fill("10");
    await block.getByRole("textbox", { name: "Подход 1, Вес, кг" }).fill("40");
    await block.getByRole("button", { name: "Подход", exact: true }).click();
    // A weight without reps or time is not a set.
    await block.getByRole("textbox", { name: "Подход 2, Повторы" }).fill("");
    await block.getByRole("textbox", { name: "Подход 2, Вес, кг" }).fill("45");
    await page.getByRole("textbox", { name: "Длительность" }).fill("900");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(block.getByText("Нужны повторы или время. Вес пишется вместе с повторами.")).toBeVisible();
    await expect(page.getByText("От 1 до 600 минут")).toBeVisible();
    await checked(page);

    await block.getByRole("textbox", { name: "Подход 2, Повторы" }).fill("8");
    await block.getByRole("textbox", { name: "Подход 2, Вес, кг" }).fill("42,5");
    await page.getByRole("textbox", { name: "Длительность" }).fill("50");
    await page.getByRole("textbox", { name: "Название" }).fill("Грудь и трицепс");
    await page.getByRole("textbox", { name: "Заметка", exact: true }).fill("Тяжело далось");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Тренировка сохранена")).toBeVisible();

    await expect(page).toHaveURL(/\/client\/diary\/workouts\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Грудь и трицепс" })).toBeVisible();
    await expect(page.getByText(/50 мин/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Жим штанги лёжа" })).toBeVisible();
    await expect(page.getByText("10 × 40 кг")).toBeVisible();
    await expect(page.getByText("8 × 42,5 кг")).toBeVisible();
    await expect(page.getByText("Рекорд").first()).toBeVisible();
    await expect(page.locator("p", { hasText: "Тяжело далось" })).toBeVisible();
    await checked(page);

    await page.getByRole("link", { name: "Изменить" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Изменить тренировку" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Грудь и трицепс");
    await expect(page.getByRole("region", { name: "Жим штанги лёжа" }).getByRole("textbox", { name: "Подход 2, Вес, кг" })).toHaveValue("42,5");
    await page.getByRole("textbox", { name: "Название" }).fill("Грудь");
    await page.getByRole("button", { name: "Убрать подход 2" }).click();
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Грудь" })).toBeVisible();
    await expect(page.getByText("8 × 42,5 кг")).toHaveCount(0);

    await open(page, "/client/diary", "Дневник");
    const row = page.getByRole("link", { name: /Грудь/ });
    await expect(row).toContainText("Жим штанги лёжа");
    await row.click();
    await page.getByRole("button", { name: "Удалить тренировку" }).click();
    const confirm = page.getByRole("dialog", { name: "Удалить тренировку?" });
    await expect(confirm).toContainText("Подходы и рекорды из неё пропадут. Отменить это нельзя.");
    await checked(page);
    await confirm.getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("Тренировка удалена")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/diary$/);
    await expect(page.getByRole("heading", { name: "Запиши первую тренировку" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the editor shows what the client did last time; a log the trainer wrote is read-only for the client", async ({ trainer, client }) => {
    const squat = await exerciseId(client, "Приседания со штангой");
    await workoutLog(trainer, {
      clientId: client.userId,
      coachingId: client.coachingId,
      title: "Ноги с тренером",
      day: mskDay(-2),
      exercise: squat.id,
      sets: [{ reps: 8, weight_kg: 60 }],
    });
    const { page } = client;
    await open(page, "/client/diary", "Дневник");
    const row = page.getByRole("link", { name: /Ноги с тренером/ });
    await expect(row).toContainText("С тренером");
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Ноги с тренером" })).toBeVisible();
    await expect(page.getByText("Изменить тренировку может только тот, кто её записал.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Изменить" })).toHaveCount(0);
    await checked(page);

    await open(page, "/client/diary/workouts/new", "Новая тренировка");
    await page.getByRole("button", { name: "Добавить упражнение" }).click();
    const picker = page.getByRole("dialog", { name: "Выбери упражнение" });
    await picker.getByRole("searchbox", { name: "Найти упражнение" }).fill(squat.name);
    await picker.getByRole("button", { name: new RegExp(`^${squat.name}`) }).first().click();
    await expect(page.getByRole("region", { name: squat.name })).toContainText(/В прошлый раз \(.+\): 8 × 60 кг/);
  });

  test("a log of another client is not found", async ({ persona }) => {
    const owner = await persona({ firstName: "Вера" });
    const other = await persona({ firstName: "Лиза" });
    const bench = await exerciseId(owner, "Жим штанги лёжа");
    const logId = await workoutLog(owner, { clientId: owner.userId, coachingId: null, title: "Тайная", day: mskDay(), exercise: bench.id, sets: [{ reps: 5 }] });
    await open(other.page, `/client/diary/workouts/${logId}`);
    await expect(other.page.getByRole("heading", { name: "Тренировка не найдена" })).toBeVisible();
    await expect(other.page.getByText("Тайная")).toHaveCount(0);
    await checked(other.page);
    await open(other.page, `/client/diary/workouts/${logId}/edit`, "Изменить тренировку");
    await expect(other.page.getByRole("heading", { name: "Тренировка не найдена" })).toBeVisible();
  });
});

test.describe("the trainer's library and templates", () => {
  test("the trainer searches the library, filters it and opens a wger exercise", async ({ trainer }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await open(page, "/trainer/exercises", "Упражнения");
    await expect(page.getByText("Библиотека wger и твои упражнения. Их ищешь в логах и шаблонах.")).toBeVisible();
    await checked(page);

    const search = page.getByRole("searchbox", { name: "Найти упражнение" });
    await search.fill("присед");
    await search.press("Enter");
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole("link", { name: /Приседания со штангой/ }).first()).toBeVisible();

    await search.fill("zzzzqqq");
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "Ничего не нашлось" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Своё упражнение" }).last()).toBeVisible();

    await open(page, "/trainer/exercises", "Упражнения");
    const filters = page.getByRole("navigation", { name: "Группа мышц" });
    await filters.getByRole("link", { name: "Грудь" }).click();
    await expect(filters.getByRole("link", { name: "Грудь" })).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("link", { name: /Жим штанги лёжа/ }).first()).toBeVisible();
    await checked(page);

    await open(page, "/trainer/exercises", "Упражнения");
    await filters.getByRole("link", { name: "Мои" }).click();
    await expect(page.getByRole("heading", { name: "Своих упражнений пока нет" })).toBeVisible();

    await open(page, "/trainer/exercises?q=%D0%96%D0%B8%D0%BC%20%D1%88%D1%82%D0%B0%D0%BD%D0%B3%D0%B8%20%D0%BB%D1%91%D0%B6%D0%B0", "Упражнения");
    await page.getByRole("link", { name: /^Жим штанги лёжа/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: /Жим штанги лёжа/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Как выполнять" })).toBeVisible();
    await expect(page.getByText(/Источник:/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Изменить" })).toHaveCount(0);
    await checked(page);

    // A copy keeps the credit of the original.
    await page.getByRole("link", { name: "Сделать своё на основе" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Своё упражнение" })).toBeVisible();
    await expect(page.getByText(/На основе «Жим штанги лёжа/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue(/Жим штанги лёжа/);
    expect(errors()).toEqual([]);
  });

  test("the trainer creates an own exercise with validation, edits it and archives it", async ({ trainer }) => {
    const { page } = trainer;
    await open(page, "/trainer/exercises", "Упражнения");
    await page.getByRole("link", { name: "Своё упражнение" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Своё упражнение" })).toBeVisible();
    await expect(page.getByText("Упражнение видишь ты и твои клиенты в своих логах. Другие тренеры его не видят.")).toBeVisible();
    await checked(page);

    await page.getByRole("textbox", { name: "Ссылка на видео" }).fill("http://example.com/clip");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Напиши название, до 200 знаков")).toBeVisible();
    await expect(page.getByText("Выбери группу мышц")).toBeVisible();
    await expect(page.getByText("Нужна ссылка, которая начинается с https://")).toBeVisible();
    await checked(page);

    await page.getByRole("textbox", { name: "Название" }).fill("Планка с подъёмом руки");
    await pick(page, "radio", "Пресс");
    await pick(page, "checkbox", "Прямая мышца живота");
    await pick(page, "checkbox", "Коврик");
    await page.getByRole("textbox", { name: "Описание" }).fill("Держи корпус ровно, руку поднимай медленно.");
    await page.getByRole("textbox", { name: "Ссылка на видео" }).fill("https://video.example.com/plank");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Упражнение сохранено")).toBeVisible();

    await expect(page.getByRole("heading", { level: 1, name: "Планка с подъёмом руки" })).toBeVisible();
    await expect(page.locator("p", { hasText: "Держи корпус ровно, руку поднимай медленно." })).toBeVisible();
    await expect(page.locator('[data-slot="badge"]', { hasText: "Прямая мышца живота" })).toBeVisible();
    await expect(page.getByRole("link", { name: /video\.example\.com/ })).toHaveAttribute("href", "https://video.example.com/plank");
    await checked(page);

    await page.getByRole("link", { name: "Изменить" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Изменить упражнение" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Планка с подъёмом руки");
    await page.getByRole("textbox", { name: "Название" }).fill("Планка с подъёмом руки и ноги");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Планка с подъёмом руки и ноги" })).toBeVisible();

    await open(page, "/trainer/exercises?own=1", "Упражнения");
    const own = page.getByRole("link", { name: /Планка с подъёмом руки и ноги/ });
    await expect(own).toContainText("Своё");
    await own.click();
    await page.getByRole("button", { name: "Убрать в архив" }).click();
    await expect(page.getByText("Упражнение в архиве", { exact: true })).toBeVisible();
    await expect(page.getByText("Упражнение в архиве: в поиске его нет, а в логах и шаблонах оно остаётся.")).toBeVisible();
    await page.getByRole("button", { name: "Вернуть из архива" }).click();
    await expect(page.getByText("Упражнение снова в библиотеке")).toBeVisible();
  });

  test("another trainer cannot see an own exercise", async ({ trainer, persona }) => {
    const own = ok(
      await trainer.db.from("exercises").insert({ source: "custom", owner_id: trainer.userId, name: "Секретный присед", category: "legs" }).select("id").single(),
      "own exercise",
    );
    const id = (own as unknown as { id: string }).id;
    ok(await trainer.db.from("exercise_translations").insert({ exercise_id: id, locale: "ru", name: "Секретный присед" }), "translation");
    const other = await persona({ firstName: "Олег" });
    await makeTrainer(other);
    await open(other.page, `/trainer/exercises/${id}`);
    await expect(other.page.getByRole("heading", { name: "Упражнение не найдено" })).toBeVisible();
    await checked(other.page);
  });

  test("the trainer builds a template, sees it in the list, edits and archives it", async ({ trainer }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await open(page, "/trainer/templates", "Шаблоны тренировок");
    await expect(page.getByRole("heading", { name: "Шаблонов пока нет" })).toBeVisible();
    await checked(page);
    await page.getByRole("link", { name: "Новый шаблон" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Новый шаблон" })).toBeVisible();

    await page.getByRole("button", { name: "Сохранить шаблон" }).click();
    await expect(page.getByText("Напиши название, до 200 знаков")).toBeVisible();
    await expect(page.getByText("Добавь хотя бы одно упражнение")).toBeVisible();

    await page.getByRole("textbox", { name: "Название" }).fill("Верх тела");
    for (const name of ["Жим штанги лёжа", "Жим Арнольда"]) {
      await page.getByRole("button", { name: "Добавить упражнение" }).click();
      const picker = page.getByRole("dialog", { name: "Выбери упражнение" });
      await picker.getByRole("searchbox", { name: "Найти упражнение" }).fill(name);
      await picker.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
      await expect(picker).toHaveCount(0);
    }
    await expect(page.getByRole("textbox", { name: "Жим штанги лёжа, Подходы" })).toHaveValue("3");
    await page.getByRole("textbox", { name: "Жим штанги лёжа, Повторы" }).fill("10");
    await page.getByRole("textbox", { name: "Жим штанги лёжа, Вес, кг" }).fill("40");
    await page.getByRole("textbox", { name: "Жим Арнольда, Подходы" }).fill("99");
    await page.getByRole("button", { name: "Сохранить шаблон" }).click();
    await expect(page.getByText("Проверь числа: подходов от 1 до 50, повторов до 1000, время как 1:30")).toBeVisible();
    await checked(page);
    await page.getByRole("textbox", { name: "Жим Арнольда, Подходы" }).fill("4");
    await page.getByRole("textbox", { name: "Жим Арнольда, Повторы" }).fill("12");
    await page.getByRole("button", { name: "Ниже: Жим штанги лёжа" }).click();
    await page.getByRole("button", { name: "Сохранить шаблон" }).click();
    await expect(page.getByText("Шаблон сохранён")).toBeVisible();
    await expect(page).toHaveURL(/\/trainer\/templates\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Шаблон" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Верх тела");
    await expect(page.getByRole("heading", { level: 3 }).first()).toHaveText(/Жим Арнольда/);
    await checked(page);

    await open(page, "/trainer/templates", "Шаблоны тренировок");
    const row = page.getByRole("link", { name: /Верх тела/ });
    await expect(row).toContainText("2 упражнения");
    await row.click();
    await page.getByRole("button", { name: "Убрать в архив" }).click();
    await expect(page.getByText("Шаблон в архиве")).toBeVisible();
    await open(page, "/trainer/templates", "Шаблоны тренировок");
    await expect(page.getByRole("heading", { name: "В архиве" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a template that is not the trainer's is not found", async ({ trainer, persona }) => {
    const bench = await exerciseId(trainer, "Жим штанги лёжа");
    const id = ok(
      await trainer.db.rpc("save_workout_template", { p_template: { title: "Мой шаблон", items: [{ exercise_id: bench.id, target_sets: 3 }] } }),
      "template",
    );
    const other = await persona({ firstName: "Олег" });
    await makeTrainer(other);
    await open(other.page, `/trainer/templates/${id}`, "Шаблон");
    await expect(other.page.getByRole("heading", { name: "Шаблон не найден" })).toBeVisible();
  });
});

test.describe("logs for a client", () => {
  test("the trainer logs a workout for the client from a template; the client sees it from the trainer", async ({ trainer, client }) => {
    const bench = await exerciseId(trainer, "Жим штанги лёжа");
    ok(
      await trainer.db.rpc("save_workout_template", {
        p_template: { title: "Грудь по шаблону", items: [{ exercise_id: bench.id, target_sets: 2, target_reps: 10, target_weight_kg: 30 }] },
      }),
      "template",
    );
    const { page } = trainer;
    const errors = collectErrors(page);
    const base = `/trainer/clients/${client.coachingId}/workouts`;
    await open(page, base);
    await expect(page.getByRole("heading", { name: "Тренировок пока нет" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Заданий нет" })).toBeVisible();
    await checked(page);

    await page.getByRole("link", { name: "Записать тренировку" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Новая тренировка" })).toBeVisible();
    await page.getByRole("button", { name: "Из шаблона" }).click();
    const picker = page.getByRole("dialog", { name: "Выбери шаблон" });
    await picker.getByRole("button", { name: /Грудь по шаблону/ }).click();
    await expect(page.getByText("Шаблон «Грудь по шаблону» подставлен. Правка лога шаблон не меняет.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Грудь по шаблону");
    const block = page.getByRole("region", { name: "Жим штанги лёжа" });
    await expect(block.getByRole("textbox", { name: "Подход 1, Повторы" })).toHaveValue("10");
    await expect(block.getByRole("textbox", { name: "Подход 2, Вес, кг" })).toHaveValue("30");
    await block.getByRole("textbox", { name: "Подход 2, Повторы" }).fill("9");
    await checked(page);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Тренировка сохранена")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${base}/[0-9a-f-]{36}$`));
    await expect(page.getByText("9 × 30 кг")).toBeVisible();
    await checked(page);

    await open(page, base);
    await expect(page.getByRole("link", { name: /Грудь по шаблону/ })).toBeVisible();
    expect(errors()).toEqual([]);

    await open(client.page, "/client/diary", "Дневник");
    await expect(client.page.getByRole("link", { name: /Грудь по шаблону/ })).toContainText("С тренером");
  });

  test("the trainer of another pair cannot write a log for this client", async ({ client, persona }) => {
    const stranger = await persona({ firstName: "Чужой" });
    await makeTrainer(stranger);
    await open(stranger.page, `/trainer/clients/${client.coachingId}/workouts/new`, "Новая тренировка");
    await expect(stranger.page.getByRole("heading", { name: "Тренировка не найдена" })).toBeVisible();
    await expect(stranger.page.getByRole("button", { name: "Сохранить" })).toHaveCount(0);
  });
});

test.describe("homework", () => {
  test("the trainer gives homework, the client marks it done with a comment, the trainer sees the mark", async ({ trainer, client }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    const base = `/trainer/clients/${client.coachingId}/workouts`;

    await open(client.page, "/client/sessions/homework");
    await expect(client.page.getByRole("heading", { name: "Тренер пока не задал домашку" })).toBeVisible();
    await checked(client.page);

    await open(page, base);
    await page.getByRole("link", { name: "Задать домашку" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Новое задание" })).toBeVisible();
    await expect(page.getByLabel("Срок").filter({ visible: true })).toHaveValue(mskDay());
    await page.getByRole("textbox", { name: "Ссылка на видео" }).fill("ftp://example.com/v");
    await page.getByRole("button", { name: "Задать" }).click();
    await expect(page.getByText("Напиши, что сделать")).toBeVisible();
    await expect(page.getByText("Ссылка должна начинаться с https://")).toBeVisible();
    await checked(page);

    await page.getByRole("textbox", { name: "Что сделать" }).fill("Планка 3 раза по минуте");
    await page.getByRole("textbox", { name: "Подробности" }).fill("Отдых между подходами минута");
    await page.getByRole("textbox", { name: "Ссылка на видео" }).fill("");
    await page.getByRole("button", { name: "Добавить упражнение" }).click();
    const picker = page.getByRole("dialog", { name: "Выбери упражнение" });
    await picker.getByRole("searchbox", { name: "Найти упражнение" }).fill("Приседания");
    const squat = picker.getByRole("button", { name: /^Приседания/ }).first();
    const squatName = (await squat.locator("p, span").first().innerText()).split("\n")[0].trim();
    await squat.click();
    await page.getByRole("textbox", { name: squatName }).fill("3 × 15");
    await page.getByRole("button", { name: "Задать" }).click();
    await expect(page.getByText("Задание отправлено клиенту")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${base}$`));
    const row = page.getByRole("link", { name: /Планка 3 раза по минуте/ });
    await expect(row).toContainText("Назначено");
    await checked(page);

    const { page: clientPage } = client;
    await open(clientPage, "/client/sessions/homework");
    const card = clientPage.getByRole("region", { name: "Планка 3 раза по минуте" });
    await expect(card).toContainText("Тренер Иван");
    await expect(card).toContainText("Назначено");
    await expect(card).toContainText("Отдых между подходами минута");
    await expect(card).toContainText("3 × 15");
    await expect(card.getByRole("link", { name: "Записать подходы" })).toBeVisible();
    await checked(clientPage);
    await card.getByRole("button", { name: "Выполнено" }).click();
    await card.getByRole("textbox", { name: "Комментарий для тренера" }).fill("Последний подход тяжело");
    await checked(clientPage);
    await card.getByRole("button", { name: "Отметить" }).click();
    await expect(clientPage.getByText("Отмечено")).toBeVisible();
    await expect(card).toContainText("Выполнено");
    await expect(card.getByRole("button", { name: "Снять отметку" })).toBeVisible();

    await open(page, base);
    await expect(page.getByRole("link", { name: /Планка 3 раза по минуте/ })).toContainText("Выполнено");
    await page.getByRole("link", { name: /Планка 3 раза по минуте/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Планка 3 раза по минуте" })).toBeVisible();
    const deadlines = page.getByRole("region", { name: "Сроки" }).or(page.locator("section", { hasText: "Сроки" })).first();
    await expect(deadlines).toContainText("Последний подход тяжело");
    await expect(deadlines).toContainText("Выполнено");
    await checked(page);
    expect(errors()).toEqual([]);

    // Taking the mark back within a day.
    await clientPage.reload();
    await clientPage.getByRole("button", { name: "Снять отметку" }).click();
    await expect(clientPage.getByText("Отметка снята")).toBeVisible();
    await expect(clientPage.getByRole("region", { name: "Планка 3 раза по минуте" }).getByRole("button", { name: "Выполнено" })).toBeVisible();
  });

  test("«Записать подходы» logs the homework's exercises and marks the deadline", async ({ trainer, client }) => {
    const plank = await exerciseId(trainer, "Приседания со штангой");
    ok(
      await trainer.db.rpc("save_homework", {
        p_homework: {
          coaching_id: client.coachingId,
          title: "Приседания дома",
          due_date: mskDay(),
          exercises: [{ exercise_id: plank.id, prescription: "3 × 12" }],
        },
      }),
      "homework",
    );
    const { page } = client;
    await open(page, "/client/sessions/homework");
    await page.getByRole("link", { name: "Записать подходы" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Новая тренировка" })).toBeVisible();
    const block = page.getByRole("region", { name: plank.name });
    await expect(block).toBeVisible();
    await block.getByRole("textbox", { name: "Подход 1, Повторы" }).fill("12");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Тренировка сохранена, задание выполнено")).toBeVisible();
    await open(page, "/client/sessions/homework");
    const card = page.getByRole("region", { name: "Приседания дома" });
    await expect(card).toContainText("Выполнено");
    await expect(card.getByRole("link", { name: "Записанная тренировка" })).toBeVisible();
  });
});
