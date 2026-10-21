import { collectErrors, expectAccessible } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import { ok } from "./support/personas";
import { expectPath, newTrainerInviteCode } from "./support/trainer";

/** "ABCDEFGHJKLM" as the screen shows it. */
const grouped = (code: string) => code.match(/.{1,4}/g)!.join("-");

test("a new person with an invite code goes through consent, preferences, the invite and the whole wizard", async ({
  persona,
}) => {
  test.setTimeout(150_000);
  const code = await newTrainerInviteCode();
  const newcomer = await persona({
    firstName: "Пётр",
    lastName: "Новичков",
    consent: false,
  });
  const { page } = newcomer;
  const errors = collectErrors(page);

  // The proxy sends a person without accepted terms to the consent screen, with the invite kept in `next`.
  await page.goto(`/onboarding/trainer?code=${code}`);
  await expectPath(page, "/onboarding/consent");
  expect(new URL(page.url()).searchParams.get("next")).toBe(
    `/onboarding/trainer?code=${code}`,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Закрытая бета DaFit" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByText("Подробнее").click();
  await expect(
    page.getByText(/Доступ каждого тренера к питанию/),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Мне есть 18 лет" }).check();
  await page.getByRole("button", { name: "Принимаю" }).click();

  // Then the personal data consent and the health data one, which may wait.
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Согласие на обработку персональных данных",
    }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Даю согласие" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Данные о здоровье" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Не сейчас" }).click();

  await expectPath(page, "/onboarding/preferences");
  await expect(
    page.getByRole("heading", { level: 1, name: "Язык и тема" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Далее" }).click();

  await expectPath(page, "/onboarding/trainer");
  await expect(
    page.getByRole("heading", { level: 1, name: "Приглашение тренера" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Приглашение действует" }),
  ).toBeVisible();
  await expect(page.getByText(grouped(code))).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Стать тренером" }).click();

  // 1. Profile: the name is required.
  await expectPath(page, "/onboarding/trainer/profile");
  await expect(
    page.getByRole("heading", { level: 1, name: "Как тебя зовут" }),
  ).toBeVisible();
  await expect(page.getByText("Шаг 1 из 8")).toBeVisible();
  await expectAccessible(page);
  const name = page.getByLabel("Имя", { exact: true });
  await expect(name).toHaveValue(/Пётр/);
  await name.fill("");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Напиши имя, до 64 символов")).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Имя", { exact: true }).fill("Пётр Силов");
  await page
    .getByLabel("Коротко о себе")
    .fill("Тренер по силовым, 5 лет в зале");
  await page
    .getByLabel("О себе", { exact: true })
    .fill("Работаю с новичками и с теми, кто возвращается после перерыва.");
  await page.getByRole("button", { name: "Далее" }).click();

  // 2. Format: at least one format, some directions, a city.
  await expectPath(page, "/onboarding/trainer/format");
  await expect(
    page.getByRole("heading", { level: 1, name: "Чем ты занимаешься" }),
  ).toBeVisible();
  await expect(page.getByText("Шаг 2 из 8")).toBeVisible();
  await expectAccessible(page);
  const offline = page.getByRole("checkbox", { name: "В зале" });
  const online = page.getByRole("checkbox", { name: "Онлайн" });
  if (await offline.isChecked()) await offline.uncheck();
  if (await online.isChecked()) await online.uncheck();
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(page.getByText("Выбери хотя бы один формат")).toBeVisible();
  await page.getByRole("checkbox", { name: "В зале" }).check();
  await page.getByRole("checkbox", { name: "Силовые" }).check();
  await page.getByRole("checkbox", { name: "Растяжка" }).check();
  await page.getByLabel("Город").fill("Казань");
  await page.getByRole("button", { name: "Далее" }).click();

  // 3. Places: one added with "Добавить ещё", then "Далее" with an empty form moves on.
  await expectPath(page, "/onboarding/trainer/locations");
  await expect(
    page.getByRole("heading", { level: 1, name: "Где проходят занятия" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Название").fill("Зал на Кремлёвской");
  await page.getByLabel("Адрес").fill("ул. Кремлёвская, 1");
  await page.getByRole("button", { name: "Добавить ещё" }).click();
  await expect(page.getByText("Уже добавлены")).toBeVisible();
  await expect(page.getByText("Зал на Кремлёвской")).toBeVisible();
  await expect(page.getByLabel("Название")).toHaveValue("");
  await page.getByRole("button", { name: "Далее" }).click();

  // 4. Region: time zone and currency.
  await expectPath(page, "/onboarding/trainer/region");
  await expect(
    page.getByRole("heading", { level: 1, name: "Часовой пояс и валюта" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Часовой пояс").selectOption("Europe/Moscow");
  await page.getByRole("radio", { name: "RUB" }).click();
  await page.getByRole("button", { name: "Далее" }).click();

  // 5. Cancellation deadline.
  await expectPath(page, "/onboarding/trainer/cancellation");
  await expect(
    page.getByRole("heading", { level: 1, name: "Дедлайн отмены" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page
    .getByLabel("Бесплатная отмена не позже чем за")
    .getByRole("radio", { name: "12 ч" })
    .click();
  await page.getByRole("button", { name: "Далее" }).click();

  // 6. Payment link: a bad URL is refused, then the step is skipped.
  await expectPath(page, "/onboarding/trainer/payment");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ссылка на оплату" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByLabel("Название").fill("СБП Тестбанк");
  await page.getByLabel("Ссылка").fill("not a link");
  await page.getByRole("button", { name: "Далее" }).click();
  await expect(
    page.getByText("Нужна ссылка, которая начинается с https://"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Пропустить" }).click();

  // 7. Prices: skipped.
  await expectPath(page, "/onboarding/trainer/prices");
  await expect(
    page.getByRole("heading", { level: 1, name: "Ценовая сетка" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Пропустить" }).click();

  // 8. Documents: later.
  await expectPath(page, "/onboarding/trainer/certificates");
  await expect(
    page.getByRole("heading", { level: 1, name: "Документы для проверки" }),
  ).toBeVisible();
  await expect(page.getByText("Шаг 8 из 8")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Загрузить документы" }),
  ).toHaveAttribute("href", "/trainer/verification");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Позже" }).click();

  // The result: the client link with its QR and the showcase preview with what was filled in.
  await expectPath(page, "/onboarding/trainer/done");
  await expect(
    page.getByRole("heading", { level: 1, name: "Профиль готов" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QR-код ссылки клиента" }),
  ).toBeVisible();
  await expect(page.getByText(/\/i\/[A-Za-z0-9_-]+$/)).toBeVisible();
  const preview = page.getByRole("region", { name: "Так тебя видят клиенты" });
  await expect(preview.getByText("Пётр Силов")).toBeVisible();
  await expect(
    preview.getByText("Тренер по силовым, 5 лет в зале"),
  ).toBeVisible();
  await expect(preview.getByText("В зале, Казань")).toBeVisible();
  await expect(preview.getByText("Силовые")).toBeVisible();
  await expect(preview.getByText("Растяжка")).toBeVisible();
  await expect(preview.getByText("Без значка")).toBeVisible();
  await expectAccessible(page);

  // What was skipped was not saved, what was filled in was.
  const trainer = ok(
    await newcomer.db
      .from("trainer_profiles")
      .select("city, cancellation_deadline_hours, default_currency")
      .eq("user_id", newcomer.userId)
      .single(),
    "trainer profile",
  );
  expect(trainer).toEqual({
    city: "Казань",
    cancellation_deadline_hours: 12,
    default_currency: "RUB",
  });
  expect(
    ok(
      await newcomer.db
        .from("payment_links")
        .select("id")
        .eq("trainer_id", newcomer.userId),
      "payment links",
    ),
  ).toHaveLength(0);
  expect(
    ok(
      await newcomer.db
        .from("packages")
        .select("id")
        .eq("trainer_id", newcomer.userId),
      "packages",
    ),
  ).toHaveLength(0);

  await page.getByRole("link", { name: "Открыть расписание" }).click();
  await expectPath(page, "/trainer/schedule");
  expect(errors()).toEqual([]);
});

test("the wizard saves a payment link and the price grid when they are filled in", async ({
  trainer,
}) => {
  const { page } = trainer;
  await page.goto("/onboarding/trainer/payment");
  await page.getByLabel("Название").fill("СБП Тестбанк");
  await page.getByLabel("Ссылка").fill("https://pay.example.test/trainer");
  await page.getByRole("radio", { name: "Самозанятый" }).click();
  await page.getByRole("button", { name: "Далее" }).click();

  await expectPath(page, "/onboarding/trainer/prices");
  await page.getByLabel("Цена разового занятия").fill("2000");
  await page.getByRole("button", { name: "Далее" }).click();
  await expectPath(page, "/onboarding/trainer/certificates");

  const links = ok(
    await trainer.db
      .from("payment_links")
      .select("title, url, kind")
      .eq("trainer_id", trainer.userId),
    "payment links",
  );
  expect(links).toEqual([
    {
      title: "СБП Тестбанк",
      url: "https://pay.example.test/trainer",
      kind: "self_employed",
    },
  ]);
  const packages = ok(
    await trainer.db
      .from("packages")
      .select("sessions_count")
      .eq("trainer_id", trainer.userId),
    "packages",
  );
  expect(
    packages.map((row) => row.sessions_count).sort((a, b) => a - b),
  ).toEqual([1, 5, 10, 20]);

  // Back on the price step the grid is already there.
  await page.goto("/onboarding/trainer/prices");
  await expect(
    page.getByText("Сетка уже есть. Поменять её можно в разделе «Деньги»."),
  ).toBeVisible();
  await expectAccessible(page);
});

test("an unknown invite code says there is no such invite", async ({
  persona,
}) => {
  const someone = await persona({ firstName: "Сергей" });
  const { page } = someone;
  await page.goto("/onboarding/trainer?code=ZZZZ-ZZZZ-ZZZZ");
  await expect(
    page.getByRole("heading", { name: "Такого приглашения нет" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Связаться с DaFit" }),
  ).toBeVisible();
  await expectAccessible(page);
  await expect(
    page.getByRole("button", { name: "Стать тренером" }),
  ).toHaveCount(0);
});

test("an empty code asks for one and a typed code is checked", async ({
  persona,
}) => {
  const code = await newTrainerInviteCode();
  const someone = await persona({ firstName: "Мария" });
  const { page } = someone;
  await page.goto("/onboarding/trainer");
  await expect(
    page.getByText(
      "Введи код из приглашения, и у тебя откроется зона «Тренер».",
    ),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Проверить код" }).click();
  // The field is required: the browser keeps the form, the screen stays as it is.
  await expect(page).toHaveURL(/\/onboarding\/trainer$/);
  await page
    .getByLabel("Код приглашения")
    .fill(code.toLowerCase().replace(/(.{4})/g, "$1 "));
  await page.getByRole("button", { name: "Проверить код" }).click();
  await expect(
    page.getByRole("heading", { name: "Приглашение действует" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ввести другой код" }).click();
  await expect(page.getByLabel("Код приглашения")).toBeVisible();
});

test("a used invite says so to the next person, and its owner is told they are a trainer already", async ({
  persona,
}) => {
  const code = await newTrainerInviteCode();
  const first = await persona({ firstName: "Олег" });
  await first.page.goto(`/onboarding/trainer?code=${code}`);
  await first.page.getByRole("button", { name: "Стать тренером" }).click();
  await expectPath(first.page, "/onboarding/trainer/profile");

  await first.page.goto(`/onboarding/trainer?code=${code}`);
  await expect(
    first.page.getByRole("heading", { name: "Ты уже тренер" }),
  ).toBeVisible();
  await expect(
    first.page.getByRole("link", { name: "Открыть зону тренера" }),
  ).toHaveAttribute("href", "/trainer");
  await expect(
    first.page.getByRole("link", { name: "Заполнить профиль" }),
  ).toHaveAttribute("href", "/onboarding/trainer/profile");
  await expectAccessible(first.page);

  const second = await persona({ firstName: "Нина" });
  await second.page.goto(`/onboarding/trainer?code=${code}`);
  await expect(
    second.page.getByRole("heading", { name: "Приглашение уже использовано" }),
  ).toBeVisible();
  await expect(second.page.getByLabel("Код приглашения")).toBeVisible();
  await expectAccessible(second.page);
});

test("a person who is not a trainer is sent from the wizard back to the invite screen", async ({
  persona,
}) => {
  const someone = await persona({ firstName: "Вера" });
  await someone.page.goto("/onboarding/trainer/format");
  await expectPath(someone.page, "/onboarding/trainer");
  await expect(someone.page.getByLabel("Код приглашения")).toBeVisible();
});

test("an unknown wizard step is not found", async ({ trainer }) => {
  // The step streams in behind a skeleton, so the status is already sent: the screen says it.
  await trainer.page.goto("/onboarding/trainer/nonsense");
  await expect(
    trainer.page.getByRole("heading", { name: "Такой страницы нет" }),
  ).toBeVisible();
});
