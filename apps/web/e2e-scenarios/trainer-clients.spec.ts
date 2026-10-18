import { collectErrors, isPhone } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import { makeTrainer, ok } from "./support/personas";
import {
  clientInviteToken,
  expectPath,
  expectSettledAccessible as expectAccessible,
} from "./support/trainer";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Long flows across two browsers; the shared machine can be slow.
test.describe.configure({ timeout: 120_000 });

test.describe("profile and showcase", () => {
  test("the trainer edits the profile section by section", async ({
    trainer,
  }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "Профиль тренера" }),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: /Иван/ }).click();
    await expectPath(page, "/trainer/profile/profile");
    await expect(
      page.getByRole("heading", { name: "Как тебя зовут" }),
    ).toBeVisible();
    // axe on this screen is the fixme'd test below.
    await page.getByLabel("Коротко о себе").fill("Силовые и мобильность");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expectPath(page, "/trainer/profile");
    await expect(page.getByText("Силовые и мобильность")).toBeVisible();

    await page.getByRole("link", { name: /Чем ты занимаешься/ }).click();
    await expectPath(page, "/trainer/profile/format");
    await expectAccessible(page);
    await page.getByRole("checkbox", { name: "Онлайн" }).check();
    await page.getByRole("checkbox", { name: "Йога" }).check();
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expectPath(page, "/trainer/profile");
    await expect(page.getByText("В зале и онлайн · Йога")).toBeVisible();

    await page.getByRole("link", { name: /Где проходят занятия/ }).click();
    await expectPath(page, "/trainer/profile/locations");
    await expect(
      page.getByRole("button", { name: "Добавить место" }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.goBack();

    await page.getByRole("link", { name: /Часовой пояс и валюта/ }).click();
    await expectPath(page, "/trainer/profile/region");
    await expectAccessible(page);
    await page.getByRole("radio", { name: "EUR" }).click();
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expectPath(page, "/trainer/profile");
    await expect(page.getByText(/· EUR$/)).toBeVisible();

    await page.getByRole("link", { name: /Дедлайн отмены/ }).click();
    await expectPath(page, "/trainer/profile/cancellation");
    await expectAccessible(page);
    await page
      .getByLabel("Бесплатная отмена не позже чем за")
      .getByRole("radio", { name: "48 ч" })
      .click();
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expectPath(page, "/trainer/profile");
    await expect(page.getByText(/Отмена за 48 ч/)).toBeVisible();

    // A section that is not part of the profile is not found.
    await page.goto("/trainer/profile/prices");
    await expect(
      page.getByRole("heading", { name: "Такой страницы нет" }),
    ).toBeVisible();
    expect(errors().filter((line) => !/404/.test(line))).toEqual([]);
  });

  test("the profile name section keeps «Сохранить» clear of the tab bar", async ({
    trainer,
  }, testInfo) => {
    const { page } = trainer;
    await page.goto("/trainer/profile/profile");
    await expect(
      page.getByRole("heading", { name: "Как тебя зовут" }),
    ).toBeVisible();
    await expectAccessible(page);
    if (isPhone(testInfo)) {
      const save = await page
        .getByRole("button", { name: "Сохранить" })
        .boundingBox();
      const tabBar = await page
        .getByRole("navigation", { name: "Разделы", exact: true })
        .filter({ visible: true })
        .boundingBox();
      expect(save!.y + save!.height).toBeLessThanOrEqual(tabBar!.y);
    }
  });

  test("the showcase editor changes the address and the public page shows the trainer", async ({
    trainer,
    persona,
  }) => {
    const { page } = trainer;
    ok(
      await trainer.db
        .from("trainer_profiles")
        .update({ headline: "Тренер по силовым" })
        .eq("user_id", trainer.userId),
      "headline",
    );
    await page.goto("/trainer/showcase");
    await expect(
      page.getByRole("heading", { level: 1, name: "Витрина" }),
    ).toBeVisible();
    await expectAccessible(page);

    const address = page.getByLabel("Адрес витрины");
    await address.fill("-bad");
    await page.getByRole("button", { name: "Сохранить адрес" }).click();
    await expect(
      page.getByText(
        "Нужно от 3 до 32 символов: латиница, цифры и дефис, в начале не дефис",
      ),
    ).toBeVisible();

    const slug = `ivan-e2e-${trainer.telegramId}`.slice(0, 32);
    await page.getByLabel("Адрес витрины").fill(slug);
    await page.getByRole("button", { name: "Сохранить адрес" }).click();
    await expect(page.getByText("Адрес сохранён")).toBeVisible();

    // The showcase may be switched off for a new trainer; switch it on to look at it.
    const show = page.getByRole("button", { name: "Включить витрину" });
    if (await show.isVisible()) {
      await show.click();
      await expect(
        page.getByRole("button", { name: "Выключить витрину" }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("img", { name: "QR-код витрины" }),
    ).toBeVisible();
    await expect(
      page.getByText(new RegExp(`/trainers/${slug}$`)),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "Открыть витрину" }).click();
    await expectPath(page, `/trainers/${slug}`);
    await expect(
      page.getByText("Это твоя витрина, так её видят клиенты."),
    ).toBeVisible();
    await expectAccessible(page);

    // Someone else sees the trainer and can become a client from here.
    const visitor = await persona({ firstName: "Гость" });
    await visitor.page.goto(`/trainers/${slug}`);
    await expect(
      visitor.page.getByRole("heading", { level: 1, name: /Иван/ }),
    ).toBeVisible();
    await expect(visitor.page.getByText("Тренер по силовым")).toBeVisible();
    await expectAccessible(visitor.page);

    // Switched off, the address says the trainer is unavailable.
    await page.goto("/trainer/showcase");
    await page.getByRole("button", { name: "Выключить витрину" }).click();
    await expect(
      page.getByRole("heading", { name: "Витрина выключена" }),
    ).toBeVisible();
    await visitor.page.goto(`/trainers/${slug}`);
    await expect(visitor.page.getByText("Тренер недоступен")).toBeVisible();
    await expectAccessible(visitor.page);
  });

  test("an unknown showcase address says the trainer is unavailable", async ({
    persona,
  }) => {
    const visitor = await persona({ firstName: "Гость" });
    await visitor.page.goto("/trainers/no-such-trainer-e2e");
    await expect(visitor.page.getByText("Тренер недоступен")).toBeVisible();
    await expectAccessible(visitor.page);
  });

  test("the trainer uploads a document and sends it for verification", async ({
    trainer,
  }) => {
    const { page } = trainer;
    await page.goto("/trainer/verification");
    await expect(
      page.getByRole("heading", { level: 1, name: "Верификация" }),
    ).toBeVisible();
    await expect(page.getByText("Не отправлена")).toBeVisible();
    await expect(
      page.getByText("Сначала добавь хотя бы один документ"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Отправить на проверку" }),
    ).toBeDisabled();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Добавить документ" }).click();
    await page.getByRole("button", { name: "Загрузить" }).click();
    await expect(page.getByText("Напиши, что это за документ")).toBeVisible();
    await expect(page.getByText("Выбери файл")).toBeVisible();

    await page.getByLabel("Что это за документ").fill("Диплом тренера");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Выбрать файл" }).click();
    await (
      await chooser
    ).setFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not a document"),
    });
    await expect(page.getByText("Подойдёт JPG, PNG или PDF")).toBeVisible();

    const second = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Выбрать файл" }).click();
    await (
      await second
    ).setFiles({ name: "diploma.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("diploma.png")).toBeVisible();
    await page.getByRole("button", { name: "Загрузить" }).click();
    await expect(page.getByText("Документ загружен")).toBeVisible();
    await expect(page.getByText("Диплом тренера")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Отправить на проверку" }).click();
    await expect(
      page.getByText("Документы отправлены на проверку"),
    ).toBeVisible();
    await expect(page.getByText("На проверке").first()).toBeVisible();
    const { data: profile } = await trainer.db
      .from("trainer_profiles")
      .select("verification_status")
      .eq("user_id", trainer.userId)
      .single();
    expect(profile?.verification_status).toBe("pending");
  });
});

test.describe("more", () => {
  const ROWS: [title: string, href: string][] = [
    ["Профиль тренера", "/trainer/profile"],
    ["QR и ссылка", "/trainer/links"],
    ["Витрина", "/trainer/showcase"],
    ["Отзывы", "/trainer/reviews"],
    ["Упражнения", "/trainer/exercises"],
    ["Шаблоны тренировок", "/trainer/templates"],
    ["Группы", "/trainer/groups"],
    ["Команда", "/trainer/team"],
    ["Аналитика", "/trainer/analytics"],
    ["Питание клиентов", "/trainer/nutrition"],
    ["QR для зала", "/trainer/checkin-qr"],
    ["Приведи друга", "/trainer/referrals"],
    ["Пригласить тренера", "/trainer/invite-trainers"],
  ];

  test("every row of Ещё opens its screen", async ({ trainer }) => {
    test.setTimeout(120_000);
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/more");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ещё" }),
    ).toBeVisible();
    await expectAccessible(page);
    for (const [title, href] of ROWS) {
      await page.goto("/trainer/more");
      await page
        .getByRole("main")
        .getByRole("link", { name: new RegExp(`^${title}`) })
        .click();
      await expectPath(page, href);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();
      await expect(page.getByText("Что-то пошло не так")).toHaveCount(0);
      await expect(page.getByText("Такой страницы нет")).toHaveCount(0);
    }
    expect(errors()).toEqual([]);
  });
});

test.describe("clients", () => {
  test("a new trainer sees the empty list with the way to get clients", async ({
    trainer,
  }, testInfo) => {
    const { page } = trainer;
    await page.goto("/trainer/clients");
    await expect(
      page.getByRole("heading", { name: "Клиентов пока нет" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Отправь клиенту ссылку или покажи QR, и он появится здесь сам.",
      ),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: "Показать QR и ссылку" }).click();
    await expectPath(page, "/trainer/links");
    if (!isPhone(testInfo))
      await expect(
        page.getByRole("heading", { name: "QR и ссылка" }).first(),
      ).toBeVisible();
  });

  test("the trainer adds a client without an account, with validation", async ({
    trainer,
  }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/clients");
    await page
      .getByRole("link", { name: "Добавить клиента", exact: true })
      .click();
    await expectPath(page, "/trainer/clients/new");
    await expect(
      page.getByRole("heading", { name: "Клиент без Telegram" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Отправить ссылку или QR/ }),
    ).toHaveAttribute("href", "/trainer/links");
    await expectAccessible(page);

    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page.getByText("Напиши имя клиента")).toBeVisible();
    await page.getByLabel("Имя").fill("Б".repeat(101));
    await page.getByRole("button", { name: "Создать" }).click();
    await expect(
      page.getByText("Имя длиннее 100 знаков, сократи его"),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Имя").fill("Борис Карточкин");
    await page.getByLabel("Контакт, по желанию").fill("boris@example.test");
    await page
      .getByLabel("Заметка, по желанию")
      .fill("Колено после травмы, без прыжков");
    await page.getByRole("button", { name: "Создать" }).click();
    await expect(page.getByText("Карточка создана")).toBeVisible();
    await expectPath(page, /^\/trainer\/clients\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Борис Карточкин" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Клиент без аккаунта: сообщений он не получает, все данные вносишь ты.",
      ),
    ).toBeVisible();
    // A card has no account, so there is no intake tab.
    await expect(
      page.getByRole("link", { name: "Анкета", exact: true }),
    ).toHaveCount(0);
    await expectAccessible(page);

    await page.goto("/trainer/clients");
    const row = page.getByRole("link", { name: /Борис Карточкин/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Без аккаунта")).toBeVisible();
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });

  test("the link screen shows the QR, the code, and a reissued link stops the old one", async ({
    trainer,
    persona,
  }) => {
    const { page } = trainer;
    const oldToken = await clientInviteToken(trainer);
    await page.goto("/trainer/links");
    await expect(
      page.getByRole("img", { name: "QR-код ссылки для клиентов" }).first(),
    ).toBeVisible();
    await expect(page.getByText(`/i/${oldToken}`)).toBeVisible();
    await expect(page.getByText("Код тренера")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Показать QR крупно" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Перевыпустить ссылку" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Перевыпустить" })
      .click();
    await expect(page.getByText("Готово, ссылка новая")).toBeVisible();
    const newToken = await clientInviteToken(trainer);
    expect(newToken).not.toBe(oldToken);
    await expect(page.getByText(`/i/${newToken}`)).toBeVisible();

    const latecomer = await persona({ firstName: "Опоздавший" });
    await latecomer.page.goto(`/i/${oldToken}`);
    await expect(
      latecomer.page.getByRole("heading", { name: "Ссылка недействительна" }),
    ).toBeVisible();
    await expectAccessible(latecomer.page);
  });

  test("the trainer opening their own link is told it is theirs", async ({
    trainer,
  }) => {
    const token = await clientInviteToken(trainer);
    await trainer.page.goto(`/i/${token}`);
    await expect(
      trainer.page.getByRole("heading", { name: "Это твоя ссылка" }),
    ).toBeVisible();
    await expectAccessible(trainer.page);
  });

  test("a client joins through the link, fills in the intake, and the trainer sees both", async ({
    trainer,
    persona,
  }) => {
    test.setTimeout(120_000);
    const token = await clientInviteToken(trainer);
    const client = await persona({ firstName: "Дарья", lastName: "Входящая" });
    const { page } = client;
    const errors = collectErrors(page);

    await page.goto(`/i/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Приглашение тренера" }),
    ).toBeVisible();
    await expect(page.getByText(/Иван/).first()).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Стать клиентом" }).click();
    await expect(
      page.getByText("Готово, ты в клиентах у тренера Иван Тренеров"),
    ).toBeVisible();

    await expectPath(
      page,
      /^\/client\/trainers\/[0-9a-f-]{36}\/intake-consent$/,
    );
    const coachingId = new URL(page.url()).pathname.split("/")[3];
    await expect(
      page.getByText(
        "В анкете есть данные о здоровье. Показать её тренеру Иван Тренеров?",
      ),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Показать", exact: true }).click();

    await expectPath(page, `/client/trainers/${coachingId}/intake`);
    await expect(page.getByText("Шаг 1 из 3")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("checkbox", { name: "Стать сильнее" }).check();
    await page.getByRole("button", { name: "Дальше" }).click();
    await page
      .getByLabel("Травмы и операции")
      .fill("Растяжение голеностопа два года назад");
    await page.getByRole("button", { name: "Дальше" }).click();
    await expect(page.getByText("Шаг 3 из 3")).toBeVisible();
    // Sending without every PAR-Q answer points at the unanswered ones.
    await page.getByRole("button", { name: "Отправить тренеру" }).click();
    await expect(
      page.getByText("Ответь на этот вопрос.").first(),
    ).toBeVisible();
    const questions = page
      .locator("fieldset")
      .filter({ has: page.getByRole("radio", { name: "Нет" }) });
    const count = await questions.count();
    for (let index = 0; index < count; index += 1)
      await questions.nth(index).getByRole("radio", { name: "Нет" }).check();
    await questions.nth(1).getByRole("radio", { name: "Да" }).check();
    await expect(page.getByText(/Есть ответ «да»/)).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Отправить тренеру" }).click();
    await expect(
      page.getByRole("heading", { name: "Анкета отправлена" }),
    ).toBeVisible();
    await expectAccessible(page);

    // The trainer sees the new client in the list and the intake on the card.
    const coach = trainer.page;
    await coach.goto("/trainer/clients");
    const row = coach.getByRole("link", { name: /Дарья Входящая/ });
    await expect(row).toBeVisible();
    await expectAccessible(coach);
    await row.click();
    await expectPath(coach, `/trainer/clients/${coachingId}`);
    await expect(
      coach.getByRole("heading", { level: 1, name: "Дарья Входящая" }),
    ).toBeVisible();
    await expectAccessible(coach);
    await coach.goto(`/trainer/clients/${coachingId}/intake`);
    await expect(
      coach.getByText("Растяжение голеностопа два года назад"),
    ).toBeVisible();
    await expect(
      coach.getByText("PAR-Q: есть «да»").filter({ visible: true }).first(),
    ).toBeVisible();
    await expectAccessible(coach);
    expect(errors()).toEqual([]);
  });

  test("a client who already trains with the trainer is told so on the link", async ({
    trainer,
    client,
  }) => {
    const token = await clientInviteToken(trainer);
    await client.page.goto(`/i/${token}`);
    await expect(
      client.page.getByText("Ты уже занимаешься у этого тренера"),
    ).toBeVisible();
    await expect(
      client.page.getByRole("link", { name: "Открыть моих тренеров" }),
    ).toHaveAttribute("href", "/client/trainers");
    await expectAccessible(client.page);
  });

  test("a made-up link is invalid", async ({ persona }) => {
    const someone = await persona({ firstName: "Кира" });
    await someone.page.goto("/i/notarealtoken123");
    await expect(
      someone.page.getByRole("heading", { name: "Ссылка недействительна" }),
    ).toBeVisible();
    await expect(
      someone.page.getByRole("link", { name: "Ввести код тренера" }),
    ).toHaveAttribute("href", "/join");
    await expectAccessible(someone.page);
  });

  test("the pair card: notes, intake before it is filled, payments and passes", async ({
    trainer,
    client,
  }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    const base = `/trainer/clients/${client.coachingId}`;

    await page.goto(base);
    await expect(
      page.getByRole("heading", { level: 1, name: "Анна Клиентова" }),
    ).toBeVisible();
    await expect(page.getByText("Занятий пока не назначено")).toBeVisible();
    await expect(page.getByText("Абонемента нет")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "Заметки", exact: true }).click();
    await expectPath(page, `${base}/notes`);
    await expect(
      page.getByRole("heading", { name: "Заметок нет" }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await expect(page.getByText("Напиши текст заметки")).toBeVisible();
    await page.getByLabel("Новая заметка").fill("Любит утренние тренировки");
    await page.getByRole("button", { name: "Сохранить заметку" }).click();
    await expect(page.getByText("Заметка сохранена")).toBeVisible();
    await expect(page.getByText("Любит утренние тренировки")).toBeVisible();
    await expect(page.getByText("Видишь только ты").first()).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "Анкета", exact: true }).click();
    await expectPath(page, `${base}/intake`);
    await expect(
      page.getByText(/Клиент ещё не заполнил анкету|Анкета скрыта клиентом/),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "Оплаты", exact: true }).click();
    await expectPath(page, `${base}/payments`);
    await expect(
      page.getByRole("link", { name: "Оплаты", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expectAccessible(page);

    await page.getByRole("link", { name: "Абонементы", exact: true }).click();
    await expectPath(page, `${base}/passes`);
    await expect(
      page.getByRole("link", { name: "Абонементы", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expectAccessible(page);

    // The overview shows the latest note.
    await page.goto(base);
    await expect(page.getByText("Последняя заметка")).toBeVisible();
    await expect(page.getByText("Любит утренние тренировки")).toBeVisible();
    expect(errors()).toEqual([]);
  });

  test("another trainer cannot open someone else's pair card", async ({
    client,
    persona,
  }) => {
    const stranger = await persona({ firstName: "Чужой" });
    await makeTrainer(stranger);
    await stranger.page.goto(`/trainer/clients/${client.coachingId}`);
    await expect(
      stranger.page.getByRole("heading", { name: "Такой страницы нет" }),
    ).toBeVisible();
  });

  test("the trainer ends the coaching and the client sees it ended", async ({
    trainer,
    client,
  }) => {
    const { page } = trainer;
    await page.goto(`/trainer/clients/${client.coachingId}`);
    await page
      .getByRole("button", { name: "Завершить работу с клиентом" })
      .click();
    const sheet = page.getByRole("dialog", {
      name: "Завершить работу с клиентом?",
    });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByText(/Анна Клиентова получит сообщение/),
    ).toBeVisible();
    await expectAccessible(page);
    await sheet.getByLabel("Причина, по желанию").fill("Клиент переехал");
    await sheet.getByRole("button", { name: "Завершить" }).click();
    await expect(page.getByText("Работа с клиентом завершена")).toBeVisible();
    await expect(
      page.getByText(/Работа завершена .+, клиент в архиве/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Завершить работу с клиентом" }),
    ).toHaveCount(0);
    await expectAccessible(page);

    // Gone from the main list, there in the archive.
    await page.goto("/trainer/clients");
    await expect(
      page.getByRole("link", { name: /Анна Клиентова/ }),
    ).toHaveCount(0);
    await page.goto("/trainer/clients?filter=archive");
    await expect(
      page.getByRole("link", { name: /Анна Клиентова/ }),
    ).toBeVisible();

    await client.page.goto(`/client/trainers/${client.coachingId}`);
    await expect(
      client.page.getByText(/ты больше не занимаешься у этого тренера/),
    ).toBeVisible();
    await expectAccessible(client.page);
  });

  test("the list filters and searches by name", async ({ trainer, client }) => {
    const { page } = trainer;
    void client;
    await page.goto("/trainer/clients");
    await expect(
      page.getByRole("link", { name: /Анна Клиентова/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: "С долгом" }).click();
    await expect(page.getByText("Долгов нет")).toBeVisible();
    await expectAccessible(page);
    await page.goto("/trainer/clients?q=Несуществующий");
    await expect(page.getByText("Никого не нашлось")).toBeVisible();
    await page.goto("/trainer/clients?q=Анна");
    await expect(
      page.getByRole("link", { name: /Анна Клиентова/ }),
    ).toBeVisible();
  });
});

test.describe("the client's side of the pair", () => {
  test("the client opens the trainer card and its goal, sharing and referral pages", async ({
    client,
  }) => {
    const { page } = client;
    const errors = collectErrors(page);
    const base = `/client/trainers/${client.coachingId}`;

    await page.goto("/client/trainers");
    await expect(
      page.getByRole("link", { name: /Иван Тренеров/ }),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: /Иван Тренеров/ }).click();
    await expectPath(page, base);
    await expect(
      page.getByRole("heading", { level: 1, name: "Иван Тренеров" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Здесь появятся заметки, которые тренер решит тебе показать",
      ),
    ).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "Что видит тренер" }).click();
    await expectPath(page, `${base}/sharing`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Что видит тренер" }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: /Замеры/ })).toBeVisible();
    await expectAccessible(page);

    await page.goto(`${base}/goal`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Твоя цель" }),
    ).toBeVisible();
    await expectAccessible(page);

    await page.goto(`${base}/referral`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Приведи друга" }),
    ).toBeVisible();
    await expect(
      page.getByText("Сейчас у тренера нет акции «Приведи друга»."),
    ).toBeVisible();
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });

  test("the client stops training with the trainer", async ({
    client,
    trainer,
  }) => {
    const { page } = client;
    await page.goto(`/client/trainers/${client.coachingId}`);
    await page
      .getByRole("button", { name: "Перестать заниматься у тренера" })
      .click();
    const sheet = page.getByRole("dialog", {
      name: "Перестать заниматься у тренера?",
    });
    await expect(sheet).toBeVisible();
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Перестать заниматься" }).click();
    await expect(
      page.getByText("Ты больше не занимаешься у этого тренера", {
        exact: true,
      }),
    ).toBeVisible();

    await trainer.page.goto(`/trainer/clients/${client.coachingId}`);
    await expect(
      trainer.page.getByText(/Работа завершена .+, клиент в архиве/),
    ).toBeVisible();
  });

  test("a client without a trainer sees the empty trainers tab", async ({
    persona,
  }) => {
    const someone = await persona({ firstName: "Лена" });
    await someone.page.goto("/client/trainers");
    await expect(
      someone.page.getByRole("heading", {
        name: "Ты пока не занимаешься у тренера",
      }),
    ).toBeVisible();
    await expectAccessible(someone.page);
  });
});
