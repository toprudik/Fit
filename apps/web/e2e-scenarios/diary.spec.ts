import { collectErrors, expectAccessible } from "../e2e/support";
import { checked, pick, mskDay, open, ownFood, quickEntry, trainerTarget } from "./support/diary";
import { expect, test } from "./support/fixtures";
import { joinTrainer, makeTrainer } from "./support/personas";

/*
 * The client's diary: food (day, own foods, dishes, favourites, water, the target) and activity, plus the
 * trainer's side of nutrition: the target for the client and comments on a day.
 */

test.describe("food diary", () => {
  test("an empty day shows the diary entries, the empty meals and no target yet", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);

    await open(page, "/client/diary", "Дневник");
    await expect(page.getByRole("link", { name: /Дневник питания/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Активность/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Запиши первую тренировку" })).toBeVisible();
    await checked(page);

    await page.getByRole("link", { name: /Дневник питания/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Питание" })).toBeVisible();
    const summary = page.getByRole("region", { name: "Итог дня" });
    await expect(summary).toContainText("0 ккал");
    await expect(summary).toContainText("Нормы пока нет");
    await expect(summary.getByRole("link", { name: "Рассчитать норму" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Добавь первый приём пищи" })).toBeVisible();
    for (const meal of ["Завтрак", "Обед", "Ужин", "Перекус"]) {
      await expect(page.getByRole("link", { name: `Добавить в «${meal}»` })).toBeVisible();
    }
    // Today has no "next day"; the previous day opens yesterday.
    await expect(page.getByRole("link", { name: "Следующий день" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Сегодня" })).toBeVisible();
    await checked(page);
    await page.getByRole("link", { name: "Предыдущий день" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Вчера" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`day=${mskDay(-1)}`));
    await expect(page.getByRole("link", { name: "Следующий день" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("a client creates an own product, with validation, edits it and meets the barcode clash", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);

    await open(page, "/client/diary/food/foods", "Мои продукты");
    await expect(page.getByRole("heading", { name: "Своих продуктов пока нет" })).toBeVisible();
    await checked(page);
    await page.getByRole("link", { name: "Новый продукт" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Новый продукт" })).toBeVisible();

    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Напиши название")).toBeVisible();
    await expect(page.getByText("Калории числом от 0 до 900")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveAttribute("aria-invalid", "true");

    await page.getByRole("textbox", { name: "Название" }).fill("Сырники бабушкины");
    await page.getByRole("textbox", { name: "Калории на 100 г" }).fill("1000");
    await page.getByRole("textbox", { name: "Белки на 100 г" }).fill("60");
    await page.getByRole("textbox", { name: "Жиры на 100 г" }).fill("30");
    await page.getByRole("textbox", { name: "Углеводы на 100 г" }).fill("30");
    await page.getByRole("textbox", { name: "Штрихкод" }).fill("123");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Калории числом от 0 до 900")).toBeVisible();
    await expect(page.getByText("Белков, жиров и углеводов вместе не больше 100 г на 100 г")).toBeVisible();
    await expect(page.getByText("Нужно от 8 до 14 цифр")).toBeVisible();
    await checked(page);

    await page.getByRole("textbox", { name: "Калории на 100 г" }).fill("220,5");
    await page.getByRole("textbox", { name: "Белки на 100 г" }).fill("15");
    await page.getByRole("textbox", { name: "Жиры на 100 г" }).fill("9");
    await page.getByRole("textbox", { name: "Углеводы на 100 г" }).fill("20");
    await page.getByRole("textbox", { name: "Порция, г" }).fill("120");
    await page.getByRole("textbox", { name: "Как назвать порцию" }).fill("2 шт");
    await page.getByRole("textbox", { name: "Штрихкод" }).fill("4600000000017");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Продукт сохранён").first()).toBeVisible();
    await expect(page).toHaveURL(/\/client\/diary\/food\/foods$/);
    const row = page.getByRole("link", { name: /Сырники бабушкины/ });
    await expect(row).toContainText("220,5 ккал на 100 г");

    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Продукт" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Название" })).toHaveValue("Сырники бабушкины");
    await expect(page.getByRole("textbox", { name: "Калории на 100 г" })).toHaveValue("220,5");
    await checked(page);
    await page.getByRole("textbox", { name: "Название" }).fill("Сырники с изюмом");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Продукт сохранён").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Сырники с изюмом/ })).toBeVisible();

    // A second product with the same barcode is refused on the field.
    await page.getByRole("link", { name: "Новый продукт" }).click();
    await page.getByRole("textbox", { name: "Название" }).fill("Творог");
    await page.getByRole("textbox", { name: "Калории на 100 г" }).fill("120");
    await page.getByRole("textbox", { name: "Штрихкод" }).fill("4600000000017");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("У тебя уже есть продукт с этим штрихкодом")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("searching the diary finds the client's own food", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await ownFood(client, { name: "Гречка отварная", kcal: 110 });
    await open(page, `/client/diary/food/add?day=${mskDay()}&meal=lunch`, "Добавить еду");
    const search = page.getByRole("searchbox", { name: "Продукт" });
    await search.fill("Гречк");
    const hit = page.getByRole("button", { name: /Гречка отварная/ });
    await expect(hit).toBeVisible({ timeout: 20_000 });
    await expect(hit).toContainText("110 ккал на 100 г");
  });

  test("a typed barcode of an own product opens it, an unknown one offers to create a product", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await ownFood(client, { name: "Кефир 1%", kcal: 40, barcode: "4600000000024" });
    await open(page, `/client/diary/food/add?day=${mskDay()}&meal=breakfast`, "Добавить еду");
    await page.getByRole("radio", { name: "Штрихкод" }).click();
    await page.getByRole("textbox", { name: "Цифры штрихкода" }).fill("12");
    await page.getByRole("button", { name: "Найти" }).click();
    await expect(page.getByText("Нужно от 8 до 14 цифр")).toBeVisible();
    await page.getByRole("textbox", { name: "Цифры штрихкода" }).fill("4600000000024");
    await page.getByRole("button", { name: "Найти" }).click();
    await expect(page.getByRole("dialog", { name: "Кефир 1%" })).toBeVisible();
  });

  test("a client adds an own food to lunch, marks it favourite, then changes and deletes the entry", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await ownFood(client, { name: "Гречка отварная", kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 });
    const errors = collectErrors(page);

    await open(page, "/client/diary/food", "Питание");
    await page.getByRole("link", { name: "Добавить в «Обед»" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Добавить еду" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Обед" })).toBeChecked();
    await expect(page.getByText("Сведения о продукте из Open Food Facts, лицензия ODbL")).toBeVisible();
    await expect(page.getByText("Хотя бы две буквы")).toBeVisible();
    await checked(page);

    await page.getByRole("radio", { name: "Мои" }).click();
    await expect(page.getByRole("heading", { name: "Мои продукты и блюда" })).toBeVisible();
    const hit = page.getByRole("button", { name: /Гречка отварная/ });
    await expect(hit).toContainText("110 ккал на 100 г");
    await checked(page);
    await hit.click();

    const sheet = page.getByRole("dialog", { name: "Гречка отварная" });
    await expect(sheet).toBeVisible();
    const grams = sheet.getByRole("textbox", { name: "Сколько граммов" });
    await expect(grams).toHaveValue("100");
    await grams.fill("200");
    await expect(sheet.getByText("220 ккал, Б 8,4 г, Ж 2,2 г, У 42,6 г")).toBeVisible();
    await grams.fill("0");
    await sheet.getByRole("button", { name: "Добавить" }).click();
    await expect(sheet.getByText("Граммы числом от 1 до 5000")).toBeVisible();
    await grams.fill("150");
    await sheet.getByRole("button", { name: "В избранное" }).click();
    await expect(sheet.getByRole("button", { name: "Убрать из избранного" })).toBeVisible();
    await checked(page);
    await sheet.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Добавлено в «Обед»")).toBeVisible();

    await expect(page).toHaveURL(/\/client\/diary\/food(\?|$)/);
    await expect(page.getByText("Обед, 165 ккал")).toBeVisible();
    await expect(page.getByRole("region", { name: "Итог дня" })).toContainText("165 ккал");
    const entry = page.getByRole("button", { name: /Гречка отварная/ });
    await expect(entry).toContainText("150 г");
    await checked(page);

    // The favourite now waits on an empty search.
    await open(page, `/client/diary/food/add?day=${mskDay()}&meal=dinner`, "Добавить еду");
    await expect(page.getByRole("heading", { name: "Избранное" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Недавние" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Гречка отварная/ }).first()).toBeVisible();
    await page.getByRole("radio", { name: "Мои" }).click();
    await expect(page.getByRole("link", { name: "Мои продукты" })).toHaveAttribute("href", "/client/diary/food/foods");

    // Change the amount and the meal, then delete.
    await open(page, "/client/diary/food", "Питание");
    await page.getByRole("button", { name: /Гречка отварная/ }).click();
    const editor = page.getByRole("dialog", { name: "Гречка отварная" });
    await expect(editor.getByRole("textbox", { name: "Граммы" })).toHaveValue("150");
    await pick(editor, "radio", "Ужин");
    await editor.getByRole("textbox", { name: "Граммы" }).fill("100");
    await checked(page);
    await editor.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible();
    await expect(page.getByText("Ужин, 110 ккал")).toBeVisible();
    await page.getByRole("button", { name: /Гречка отварная/ }).click();
    await page.getByRole("dialog", { name: "Гречка отварная" }).getByRole("button", { name: "Удалить запись" }).click();
    await expect(page.getByText("Запись удалена")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Добавь первый приём пищи" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("«Добавить» of another meal opens a fresh add screen for that meal", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await ownFood(client, { name: "Гречка отварная", kcal: 110 });
    await open(page, "/client/diary/food", "Питание");
    await page.getByRole("link", { name: "Добавить в «Обед»" }).click();
    await page.getByRole("radio", { name: "Мои" }).click();
    await page.getByRole("button", { name: /Гречка отварная/ }).click();
    await page.getByRole("dialog", { name: "Гречка отварная" }).getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Добавлено в «Обед»")).toBeVisible();
    await expect(page.getByText("Обед, 110 ккал")).toBeVisible();

    await page.getByRole("link", { name: "Добавить в «Ужин»" }).click();
    await expect(page).toHaveURL(/meal=dinner/);
    await expect(page.getByRole("radio", { name: "Ужин" })).toBeChecked();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Поиск" })).toBeChecked();
  });

  test("quick kcal need a number, then land in the meal without a name", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await open(page, `/client/diary/food/add?day=${mskDay()}&meal=snack`, "Добавить еду");
    await page.getByRole("radio", { name: "Калории" }).click();
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Калории числом от 1 до 5000")).toBeVisible();
    await page.getByRole("textbox", { name: "Калории", exact: true }).fill("6000");
    await page.getByRole("textbox", { name: "Белки" }).fill("abc");
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Калории числом от 1 до 5000")).toBeVisible();
    await expect(page.getByText("Граммы числом, можно оставить пустым")).toBeVisible();
    await checked(page);
    await page.getByRole("textbox", { name: "Калории", exact: true }).fill("250");
    await page.getByRole("textbox", { name: "Белки" }).fill("");
    await page.getByRole("button", { name: "Добавить" }).click();
    await expect(page.getByText("Добавлено в «Перекус»")).toBeVisible();
    await expect(page.getByText("Перекус, 250 ккал")).toBeVisible();
    await expect(page.getByRole("button", { name: /Калории без названия/ })).toBeVisible();
  });

  test("«Как вчера» copies yesterday's meal into today", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await quickEntry(client, { day: mskDay(-1), meal: "breakfast", kcal: 380, title: "Омлет" });
    await open(page, "/client/diary/food", "Питание");
    await page.getByRole("button", { name: "Как вчера" }).click();
    await expect(page.getByText("Добавили то же, что вчера")).toBeVisible();
    await expect(page.getByText("Завтрак, 380 ккал")).toBeVisible();
    await expect(page.getByRole("button", { name: /Омлет/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Как вчера" })).toHaveCount(0);
  });

  test("a client builds a dish from own products, opens it and deletes it", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await ownFood(client, { name: "Рис басмати", kcal: 350, protein: 7, fat: 1, carbs: 78 });
    await ownFood(client, { name: "Куриное филе", kcal: 110, protein: 23, fat: 1.5, carbs: 0 });
    const errors = collectErrors(page);

    await open(page, "/client/diary/food/foods", "Мои продукты");
    await page.getByRole("link", { name: "Новое блюдо" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Новое блюдо" })).toBeVisible();
    await page.getByRole("button", { name: "Сохранить блюдо" }).click();
    await expect(page.getByText("Напиши название")).toBeVisible();
    await expect(page.getByText("Добавь хотя бы один продукт")).toBeVisible();
    await checked(page);

    await page.getByRole("textbox", { name: "Название блюда" }).fill("Рис с курицей");
    for (const name of ["Рис басмати", "Куриное филе"]) {
      await page.getByRole("button", { name: "Добавить продукт" }).click();
      const pick = page.getByRole("dialog", { name: "Продукт для блюда" });
      await expect(pick.getByRole("heading", { name: "Мои продукты и блюда" })).toBeVisible();
      await pick.getByRole("button", { name: new RegExp(name) }).click();
      await expect(pick).toHaveCount(0);
    }
    await page.getByRole("textbox", { name: "Рис басмати" }).fill("100");
    await page.getByRole("textbox", { name: "Куриное филе" }).fill("150");
    // 350 + 165 kcal over 250 g, 300 g once cooked.
    await expect(page.getByText("Всё блюдо: 515 ккал, 250 г")).toBeVisible();
    await page.getByRole("textbox", { name: "Вес готового блюда, г" }).fill("300");
    await expect(page.getByText(/^На 100 г: 171,7 ккал/)).toBeVisible();
    await page.getByRole("textbox", { name: "Вес готового блюда, г" }).fill("60000");
    await page.getByRole("button", { name: "Сохранить блюдо" }).click();
    await expect(page.getByText("Вес числом от 1 до 50 000 г")).toBeVisible();
    await page.getByRole("textbox", { name: "Вес готового блюда, г" }).fill("300");
    await checked(page);
    await page.getByRole("button", { name: "Сохранить блюдо" }).click();
    await expect(page.getByText("Блюдо сохранено")).toBeVisible();

    const dish = page.getByRole("link", { name: /Рис с курицей/ });
    await expect(dish).toBeVisible();
    await dish.click();
    await expect(page.getByRole("heading", { level: 1, name: "Продукт" })).toBeVisible();
    await expect(page.locator("main").getByText("Рис с курицей").first()).toBeAttached();
    await checked(page);
    await page.getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("Удалено. Старые записи в дневнике остались.")).toBeVisible();
    await expect(page).toHaveURL(/\/client\/diary\/food\/foods$/);
    await expect(page.getByRole("link", { name: /Рис с курицей/ })).toHaveCount(0);
    expect(errors()).toEqual([]);
  });

  test("a food that is not the client's shows «Такого продукта нет»", async ({ persona }) => {
    const owner = await persona({ firstName: "Вера" });
    const other = await persona({ firstName: "Лиза" });
    const foodId = await ownFood(owner, { name: "Секретный пирог", kcal: 300 });
    await open(other.page, `/client/diary/food/foods/${foodId}`, "Продукт");
    await expect(other.page.getByRole("heading", { name: "Такого продукта нет" })).toBeVisible();
    await expect(other.page.getByText("Секретный пирог")).toHaveCount(0);
    await expect(other.page.getByRole("link", { name: "Мои продукты" })).toBeVisible();
    await checked(other.page);
    await open(other.page, "/client/diary/food/foods/not-a-uuid", "Продукт");
    await expect(other.page.getByRole("heading", { name: "Такого продукта нет" })).toBeVisible();
  });

  test("water: two portions, an own amount with validation, and taking the last one back", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await open(page, "/client/diary/food", "Питание");
    const water = page.getByRole("region", { name: "Вода" });
    await expect(water).toContainText("0 мл");
    await expect(water.getByRole("button", { name: "Отменить последнее" })).toHaveCount(0);
    await water.getByRole("button", { name: "+250 мл" }).click();
    await expect(page.getByText("Добавлено 250 мл")).toBeVisible();
    await expect(water.getByText("250 мл", { exact: true })).toBeVisible();
    await water.getByRole("button", { name: "+500 мл" }).click();
    await expect(water.getByText("750 мл", { exact: true })).toBeVisible();

    await water.getByRole("textbox", { name: "Своё количество, мл" }).fill("6000");
    await water.getByRole("button", { name: "Добавить" }).click();
    await expect(water.getByText("От 1 до 5000 мл")).toBeVisible();
    await checked(page);
    await water.getByRole("textbox", { name: "Своё количество, мл" }).fill("150");
    await water.getByRole("button", { name: "Добавить" }).click();
    await expect(water.getByText("900 мл", { exact: true })).toBeVisible();
    await expect(water.getByRole("textbox", { name: "Своё количество, мл" })).toHaveValue("");

    await water.getByRole("button", { name: "Отменить последнее" }).click();
    await expect(page.getByText("Последняя запись убрана")).toBeVisible();
    await expect(water.getByText("750 мл", { exact: true })).toBeVisible();
  });
});

test.describe("nutrition target", () => {
  test("the calculator asks for every field, then its result becomes the target only on «Сделать нормой»", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);

    await open(page, "/client/diary/food/target", "Цель и норма");
    await expect(page.getByRole("heading", { name: "Нормы пока нет" })).toBeVisible();
    await checked(page);
    await page.getByRole("button", { name: "Рассчитать" }).click();
    await expect(page.getByText("Сначала выбери цель выше")).toBeVisible();
    await expect(page.getByText("Выбери пол для расчёта")).toBeVisible();
    await expect(page.getByText("Укажи дату рождения")).toBeVisible();
    await expect(page.getByText("Укажи рост числом, например 170")).toBeVisible();
    await expect(page.getByText("Укажи вес числом, например 72,5")).toBeVisible();
    await checked(page);

    await pick(page, "radio", "Держать вес");
    await expect(page.getByText("Цель сохранена")).toBeVisible();
    await pick(page, "radio", "Женский");
    await page.getByLabel("Дата рождения").filter({ visible: true }).fill("1992-05-14");
    await page.getByRole("textbox", { name: "Рост" }).fill("168");
    await page.getByRole("textbox", { name: "Вес" }).fill("62,5");
    await pick(page, "radio", /Средняя/);
    await page.getByRole("button", { name: "Рассчитать" }).click();

    const result = page.getByRole("region", { name: "Новая норма" });
    await expect(result).toBeVisible();
    await expect(result).toContainText(/\d[\d\s]* ккал/);
    await expect(result).toContainText(/Белки \d+ г, жиры \d+ г, углеводы \d+ г/);
    // Not the target yet.
    await expect(page.getByRole("heading", { name: "Нормы пока нет" })).toBeVisible();
    // Scrolled here, the result sits under the tab bar: its labels must stay readable over it.
    await checked(page);
    const kcal = (await result.locator("p").first().innerText()).trim();
    await result.getByRole("button", { name: "Сделать нормой" }).click();
    await expect(page.getByText("Норма сохранена")).toBeVisible();
    const target = page.getByRole("region", { name: "Норма на день" });
    await expect(target).toContainText(kcal);
    await expect(target).toContainText("Рассчитано по формуле");

    // The diary now counts against it, and «Прогресс» shows the goal with the target.
    await open(page, "/client/diary/food", "Питание");
    await expect(page.getByRole("region", { name: "Итог дня" })).toContainText(`0 из ${kcal}`);
    await expect(page.getByRole("region", { name: "Итог дня" })).toContainText(/Осталось/);
    await open(page, "/client/progress", "Прогресс");
    await expect(page.getByRole("link", { name: /Цель и норма питания/ })).toContainText(`Держать вес, ${kcal}`);
    expect(errors()).toEqual([]);
  });

  test("a minor gets no target from the formula", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const year = Number(mskDay().slice(0, 4)) - 15;
    await open(page, "/client/diary/food/target", "Цель и норма");
    await pick(page, "radio", "Набрать массу");
    await expect(page.getByText("Цель сохранена")).toBeVisible();
    await pick(page, "radio", "Мужской");
    await page.getByLabel("Дата рождения").filter({ visible: true }).fill(`${year}-03-01`);
    await page.getByRole("textbox", { name: "Рост" }).fill("170");
    await page.getByRole("textbox", { name: "Вес" }).fill("60");
    await page.getByRole("button", { name: "Рассчитать" }).click();
    await expect(page.getByText("Формула рассчитана на взрослых. Норму задаст тренер.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сделать нормой" })).toHaveCount(0);
  });

  test("with targets from two trainers the client chooses whose one the diary uses", async ({ persona, trainer, client }) => {
    const second = await persona({ firstName: "Пётр", lastName: "Второй" });
    await makeTrainer(second);
    const secondPair = await joinTrainer(client, second);
    await trainerTarget(trainer, client.coachingId, 2100);
    await trainerTarget(second, secondPair, 1900);
    const { page } = client;

    await open(page, "/client/diary/food/target", "Цель и норма");
    await expect(page.getByRole("heading", { name: "Чья норма в дневнике" })).toBeVisible();
    const choice = page.getByRole("group", { name: "Чья норма в дневнике" });
    await expect(choice.getByRole("radio")).toHaveCount(2);
    await checked(page);
    const active = page.getByRole("region", { name: "Норма на день" });
    const before = await active.innerText();
    const other = before.includes("Иван") ? /Пётр/ : /Иван/;
    const otherKcal = before.includes("Иван") ? "1 900 ккал" : "2 100 ккал";
    await choice.getByText(other).click();
    await expect(page.getByText("Норма выбрана")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("region", { name: "Норма на день" })).toContainText(otherKcal.replace(" ", " "));
  });
});

test.describe("nutrition with the trainer", () => {
  test("the trainer sets the client's target, with the low-kcal check, and the client sees whose it is", async ({ trainer, client }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await open(page, `/trainer/clients/${client.coachingId}/nutrition`);
    await expect(page.getByText("Своей нормы для клиента пока нет")).toBeVisible();
    await expect(page.getByText("Клиент ещё не выбрал цель")).toBeVisible();
    await expect(page.getByRole("heading", { name: "В этот день записей нет" })).toBeVisible();
    await checked(page);

    await page.getByRole("button", { name: "Задать норму" }).click();
    const sheet = page.getByRole("dialog", { name: "Норма клиента" });
    await sheet.getByRole("textbox", { name: "Калории" }).fill("400");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    await expect(sheet.getByText("Целое число от 500 до 10 000")).toBeVisible();
    await checked(page);
    await sheet.getByRole("textbox", { name: "Калории" }).fill("1000");
    await sheet.getByRole("button", { name: "Сохранить" }).click();
    const low = page.getByRole("dialog", { name: /Норма ниже/ });
    await expect(low).toBeVisible();
    await expect(low).toContainText("Такую норму держат только под наблюдением. Точно сохранить?");
    await low.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Норма сохранена")).toBeVisible();
    const mine = page.getByRole("region", { name: "Твоя норма" });
    await expect(mine).toContainText("1 000 ккал");
    await expect(mine).toContainText("Действует в дневнике клиента");

    await mine.getByRole("button", { name: "Изменить норму" }).click();
    const edit = page.getByRole("dialog", { name: "Норма клиента" });
    await edit.getByRole("textbox", { name: "Калории" }).fill("2000");
    await edit.getByRole("textbox", { name: "Белки" }).fill("130");
    await edit.getByRole("textbox", { name: "Жиры" }).fill("70");
    await edit.getByRole("textbox", { name: "Углеводы" }).fill("210");
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await expect(mine).toContainText("2 000 ккал");
    await expect(mine).toContainText("Белки 130 г, жиры 70 г, углеводы 210 г");
    expect(errors()).toEqual([]);

    await open(client.page, "/client/diary/food/target", "Цель и норма");
    const target = client.page.getByRole("region", { name: "Норма на день" });
    await expect(target).toContainText("2 000 ккал");
    await expect(target).toContainText("От тренера Иван");
    await open(client.page, "/client/diary/food", "Питание");
    await expect(client.page.getByRole("region", { name: "Итог дня" })).toContainText("0 из 2 000 ккал");

    await mine.getByRole("button", { name: "Убрать норму" }).click();
    await expect(page.getByText("Норма убрана")).toBeVisible();
    await expect(page.getByText("Своей нормы для клиента пока нет")).toBeVisible();
  });

  test("the trainer comments on a day of the diary; the client sees it with «Ответить» and can hide it", async ({ trainer, client }) => {
    await quickEntry(client, { meal: "lunch", kcal: 640, title: "Паста карбонара" });
    const { page } = trainer;
    await open(page, `/trainer/clients/${client.coachingId}/nutrition`);
    const diary = page.getByRole("region", { name: "Дневник клиента" });
    await expect(diary.getByText("Обед, 640 ккал")).toBeVisible();
    await expect(diary.getByText("Паста карбонара")).toBeVisible();
    await expect(diary.getByRole("button", { name: /Паста карбонара/ })).toHaveCount(0);

    await diary.getByRole("button", { name: "Отправить" }).click();
    await expect(diary.getByText("Напиши комментарий, до 1000 знаков")).toBeVisible();
    await checked(page);
    await diary.getByRole("textbox", { name: "Комментарий к дню" }).fill("Хороший обед, но добавь овощей");
    await diary.getByRole("button", { name: "Отправить" }).click();
    await expect(page.getByText("Комментарий отправлен")).toBeVisible();
    await expect(diary.getByText("Хороший обед, но добавь овощей")).toBeVisible();
    await expect(diary.getByRole("textbox", { name: "Комментарий к дню" })).toHaveValue("");

    await diary.getByRole("button", { name: "Изменить" }).click();
    const edit = page.getByRole("dialog", { name: "Комментарий" });
    await edit.getByRole("textbox", { name: "Комментарий к дню" }).fill("Хороший обед, добавь салат");
    await edit.getByRole("button", { name: "Сохранить" }).click();
    await expect(diary.getByText("Хороший обед, добавь салат")).toBeVisible();

    const { page: clientPage } = client;
    await open(clientPage, "/client/diary/food", "Питание");
    const comments = clientPage.getByRole("region", { name: "Комментарии тренера" });
    await expect(comments).toContainText("Иван");
    await expect(comments).toContainText("Хороший обед, добавь салат");
    // Without a Telegram username the reply goes to the pair, where the client can ask to be contacted.
    await expect(comments.getByRole("link", { name: "Ответить" })).toHaveAttribute("href", `/client/trainers/${client.coachingId}`);
    await checked(clientPage);
    await comments.getByRole("button", { name: "Скрыть" }).click();
    await expect(clientPage.getByText("Комментарий скрыт")).toBeVisible();
    await expect(comments.getByText("Хороший обед, добавь салат")).toHaveCount(0);
    await comments.getByRole("button", { name: "Показать скрытые: 1" }).click();
    await expect(comments.getByText("Хороший обед, добавь салат")).toBeVisible();
    await comments.getByRole("button", { name: "Показать", exact: true }).click();
    await expect(clientPage.getByText("Комментарий снова виден")).toBeVisible();

    await diary.getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("Комментарий удалён")).toBeVisible();
    await clientPage.reload();
    await expect(clientPage.getByRole("region", { name: "Комментарии тренера" })).toHaveCount(0);
  });

  test("a trainer cannot open the nutrition of someone else's client", async ({ persona, client }) => {
    const stranger = await persona({ firstName: "Чужой" });
    await makeTrainer(stranger);
    await quickEntry(client, { meal: "dinner", kcal: 500, title: "Плов" });
    await open(stranger.page, `/trainer/clients/${client.coachingId}/nutrition`);
    await expect(stranger.page.getByText("Плов")).toHaveCount(0);
    await expect(stranger.page.getByRole("button", { name: "Задать норму" })).toHaveCount(0);
    await expectAccessible(stranger.page);
  });
});

test.describe("activity", () => {
  test("steps by hand, sleep with quality, and the week", async ({ persona }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    const errors = collectErrors(page);
    await open(page, "/client/diary", "Дневник");
    await page.getByRole("link", { name: /Активность/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Активность" })).toBeVisible();
    const steps = page.getByRole("region", { name: "Шаги" });
    await expect(steps).toContainText("0 шагов");
    await expect(steps).toContainText("Цель 8 000");
    await expect(page.getByRole("heading", { name: "Последние 7 дней" })).toBeVisible();
    await checked(page);

    await steps.getByRole("textbox", { name: "Шагов за день" }).fill("много");
    await steps.getByRole("button", { name: "Сохранить" }).click();
    await expect(steps.getByText("Напиши число от 0 до 100 000")).toBeVisible();
    await steps.getByRole("textbox", { name: "Шагов за день" }).fill("9500");
    await steps.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Шаги сохранены")).toBeVisible();
    await expect(steps).toContainText("9 500 шагов");
    await expect(steps).toContainText("вручную");
    await expect(steps.getByRole("progressbar", { name: "Шаги" })).toHaveAttribute("aria-valuenow", "9500");

    const sleep = page.getByRole("region", { name: "Сон" });
    await sleep.getByRole("textbox", { name: "Сколько спал(а)" }).fill("долго");
    await sleep.getByRole("button", { name: "Сохранить" }).click();
    await expect(sleep.getByText("Напиши часы и минуты, например 7:30")).toBeVisible();
    await sleep.getByRole("textbox", { name: "Сколько спал(а)" }).fill("7:30");
    await pick(sleep, "radio", "4 из 5");
    await sleep.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сон сохранён")).toBeVisible();
    await expect(sleep).toContainText("7:30");
    await expect(sleep).toContainText("4 из 5");
    await checked(page);

    await steps.getByRole("button", { name: "Убрать ручное значение" }).click();
    await expect(page.getByText("Ручное значение убрано")).toBeVisible();
    await expect(steps).toContainText("0 шагов");

    // Yesterday from the week list.
    await page.getByRole("link", { name: /Вчера/ }).click();
    await expect(page).toHaveURL(new RegExp(`day=${mskDay(-1)}`));
    await expect(page.getByRole("heading", { level: 2, name: "Вчера" })).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("the iPhone shortcut token: issue it, send steps with it, reissue and revoke", async ({ persona, baseURL }) => {
    const client = await persona({ firstName: "Вера" });
    const { page } = client;
    await open(page, "/client/diary/activity", "Активность");
    await expect(page.getByRole("link", { name: /Шаги с iPhone/ })).toContainText("Команда сама отправит шаги из «Здоровья»");
    await page.getByRole("link", { name: /Шаги с iPhone/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Шаги с iPhone" })).toBeVisible();
    const card = page.getByRole("region", { name: "Твой токен" });
    await expect(card).toContainText("Токена пока нет");
    await expect(page.getByRole("heading", { name: "Как настроить" })).toBeVisible();
    await expect(page.getByText(`${baseURL}/api/ingest/steps`).first()).toBeVisible();
    await checked(page);

    await card.getByRole("button", { name: "Создать токен" }).click();
    await expect(card.getByText("Скопируй токен сейчас: потом DaFit его не покажет.")).toBeVisible();
    const token = (await card.locator("code").innerText()).trim();
    expect(token.length).toBeGreaterThan(20);
    await checked(page);

    const sent = await page.request.post("/api/ingest/steps", {
      headers: { authorization: `Bearer ${token}`, "accept-language": "ru", "content-type": "application/json" },
      data: { steps: 7321 },
    });
    expect(sent.status()).toBe(200);
    const refused = await page.request.post("/api/ingest/steps", {
      headers: { authorization: "Bearer not-a-token", "content-type": "application/json" },
      data: { steps: 100 },
    });
    expect(refused.status()).toBe(401);

    await open(page, "/client/diary/activity", "Активность");
    const steps = page.getByRole("region", { name: "Шаги" });
    await expect(steps).toContainText("7 321 шаг");
    await expect(steps).toContainText("с iPhone");

    await open(page, "/client/diary/activity/shortcut", "Шаги с iPhone");
    await expect(card).toContainText(/Токен создан/);
    await card.getByRole("button", { name: "Перевыпустить" }).click();
    await expect(page.getByText("Старый токен больше не работает")).toBeVisible();
    const old = await page.request.post("/api/ingest/steps", {
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: { steps: 100 },
    });
    expect(old.status()).toBe(401);
    await card.getByRole("button", { name: "Отозвать" }).click();
    await expect(page.getByText("Токен отозван, команда больше не сможет отправлять шаги")).toBeVisible();
    await expect(card).toContainText("Токена пока нет");
  });
});
