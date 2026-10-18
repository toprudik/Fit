import type { Page } from "@playwright/test";
import { expectAccessible, collectErrors } from "../e2e/support";
import { expectToast, grantPro, moscowAt, namedAdmin, namedTrainer, verifyTrainer } from "./support/admin";
import { expect, test } from "./support/fixtures";
import { joinTrainer, ok, type Persona } from "./support/personas";

/** The one-time link from the invite sheet, as a path on this app. */
async function inviteLinkPath(page: Page): Promise<string> {
  const sheet = page.getByRole("dialog", { name: "Ссылка-приглашение" });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const text = await sheet.getByText(/\/trainer\/team\/accept\?token=/).innerText();
  const url = new URL(text.trim());
  return `${url.pathname}${url.search}`;
}

type Named = Persona & { lastName: string };

/** A trainer with Pro and a client, and a verified colleague who can accept their invites. */
async function team(persona: (options: { firstName: string; lastName?: string }) => Promise<Persona>) {
  const admin = await namedAdmin(persona);
  const owner: Named = await namedTrainer(persona, "Марина");
  const colleague: Named = await namedTrainer(persona, "Денис");
  await grantPro(owner, admin);
  await verifyTrainer(owner, admin);
  await verifyTrainer(colleague, admin);
  const client = await persona({ firstName: "Полина", lastName: "Клиентская" });
  const coachingId = await joinTrainer(client, owner);
  return { admin, owner, colleague, client, coachingId };
}

test.describe("team and delegation", () => {
  test.slow();

  test("a trainer without Pro sees the lock, and nothing is delegated to them yet", async ({ trainer }) => {
    const { page } = trainer;
    const errors = collectErrors(page);
    await page.goto("/trainer/team");
    await expect(page.getByRole("heading", { level: 1, name: "Команда" })).toBeVisible();
    await expect(page.getByText("Помощник и подмена в тарифе Pro")).toBeVisible();
    await expect(page.getByRole("button", { name: "Добавить помощника" })).toHaveCount(0);
    await expect(page.getByText("Тебе пока ничего не передавали")).toBeVisible();
    await expectAccessible(page);

    await page.goto("/trainer/clients/delegated");
    await expect(page.getByRole("heading", { name: "Пока никто не передал тебе клиентов" })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/trainer/team/accept?token=AAAAAAAAAAAAAAAAAAAAAAAA");
    await expect(page.getByRole("heading", { name: "Приглашение не найдено" })).toBeVisible();
    await expect(page.getByRole("link", { name: "К команде" })).toHaveAttribute("href", "/trainer/team");
    await expectAccessible(page);
    expect(errors()).toEqual([]);
  });

  test("an owner invites a helper, the helper works with the client without money, and loses access on revoke", async ({ persona }) => {
    const { owner, colleague, client, coachingId } = await team(persona);
    const ownerName = `Марина ${owner.lastName}`;
    const colleagueName = `Денис ${colleague.lastName}`;

    const { page } = owner;
    await page.goto("/trainer/team");
    await expect(page.getByText("Помощников пока нет")).toBeVisible();
    await expect(page.getByText("Подмен пока не было")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Добавить помощника" }).click();
    const form = page.getByRole("dialog", { name: "Новый помощник" });
    await expect(form.getByText("Абонементы, оплаты, долги и цены помощнику не видны никогда.")).toBeVisible();
    await expectAccessible(page);
    // Unticking every scope is refused.
    for (const scope of ["Расписание и запись", "Отметка посещений", "Логи тренировок"]) await form.getByRole("checkbox", { name: scope }).click();
    await form.getByRole("button", { name: "Создать приглашение" }).click();
    await expect(form.getByText("Выбери хотя бы одно")).toBeVisible();
    for (const scope of ["Расписание и запись", "Заметки и анкета", "Домашние задания"]) await form.getByRole("checkbox", { name: scope }).click();
    // Picking clients but none of them is refused too.
    await form.getByRole("radio", { name: "Выбрать" }).click();
    await form.getByRole("button", { name: "Создать приглашение" }).click();
    await expect(form.getByText("Выбери хотя бы одного клиента")).toBeVisible();
    await form.getByRole("checkbox", { name: "Полина Клиентская" }).click();
    await form.getByRole("button", { name: "Создать приглашение" }).click();
    const link = await inviteLinkPath(page);
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Приглашение ещё не приняли")).toBeVisible();
    await expect(page.getByText("Ждёт ответа").first()).toBeVisible();

    // The owner cannot accept their own invite.
    await page.goto(link);
    await page.getByRole("button", { name: "Принять" }).click();
    await expectToast(page, "Это твоё приглашение, его принимает другой тренер.");

    const helper = colleague.page;
    await helper.goto(link);
    await expect(helper.getByRole("heading", { level: 1, name: "Приглашение в команду" })).toBeVisible();
    await expect(helper.getByText(`Тренер ${ownerName} приглашает тебя помощником.`)).toBeVisible();
    await expect(helper.getByText("Расписание и запись")).toBeVisible();
    await expect(helper.getByText("Заметки и анкета")).toBeVisible();
    await expect(helper.getByText("Клиентов: 1")).toBeVisible();
    await expectAccessible(helper);
    await helper.getByRole("button", { name: "Принять" }).click();
    await expectToast(helper, "Приглашение принято");
    await expect(helper).toHaveURL(/\/trainer\/team$/);
    await expect(helper.getByText(`От тренера ${ownerName}`)).toBeVisible();
    await expect(helper.getByText("Действует").first()).toBeVisible();

    // The link works once.
    const late = await namedTrainer(persona, "Кира");
    await late.page.goto(link);
    await expect(late.page.getByRole("heading", { name: "Приглашение не найдено" })).toBeVisible();

    await helper.goto("/trainer/clients/delegated");
    await expect(helper.getByRole("heading", { level: 1, name: "Делегировано мне" })).toBeVisible();
    await expect(helper.getByRole("heading", { name: `От тренера ${ownerName}` })).toBeVisible();
    await expect(helper.getByRole("link", { name: "Делегировано мне" })).toHaveAttribute("aria-current", "true");
    await expectAccessible(helper);
    await helper.getByRole("link", { name: "Полина Клиентская" }).click();
    await expect(helper).toHaveURL(new RegExp(`/trainer/clients/delegated/${coachingId}`));
    await expect(helper.getByText(`Клиент тренера ${ownerName}`)).toBeVisible();
    await expect(helper.getByRole("heading", { name: "Занятия" })).toBeVisible();
    await expect(helper.getByRole("heading", { name: "Заметки" })).toBeVisible();
    const card = await helper.getByRole("main").innerText();
    for (const money of ["₽", "Абонемент", "Оплат", "Долг", "Цена"]) expect(card).not.toContain(money);
    await expectAccessible(helper);
    void client;

    // The owner sees the helper and revokes the access.
    await page.goto("/trainer/team");
    await expect(page.getByText(colleagueName)).toBeVisible();
    await page.getByRole("button", { name: `Отозвать: ${colleagueName}` }).click();
    await expectToast(page, "Доступ отозван");
    await page.reload();
    await expect(page.getByText("Отозвано").first()).toBeVisible();

    await helper.goto(`/trainer/clients/delegated/${coachingId}`);
    await expect(helper.getByRole("heading", { name: "Клиент больше не передан тебе" })).toBeVisible();
    await expect(helper.getByText("Полина Клиентская")).toHaveCount(0);
    await expectAccessible(helper);
  });

  test("an unverified trainer cannot accept a helper invite", async ({ persona }) => {
    const admin = await namedAdmin(persona);
    const owner = await namedTrainer(persona, "Марина");
    await grantPro(owner, admin);
    const novice = await namedTrainer(persona, "Ефим");
    const invite = ok(
      await owner.db.rpc("create_delegation", { p_kind: "assistant", p_scopes: ["schedule"], p_all_clients: true }),
      "assistant invite",
    );
    await novice.page.goto(`/trainer/team/accept?token=${invite[0].token}`);
    await novice.page.getByRole("button", { name: "Принять" }).click();
    await expectToast(novice.page, "Принять может только тренер, который прошёл проверку в DaFit.");
    await novice.page.getByRole("button", { name: "Отклонить" }).click();
    await expectToast(novice.page, "Приглашение отклонено");
    await expect(novice.page).toHaveURL(/\/trainer\/team$/);
    await owner.page.goto("/trainer/team");
    await expect(owner.page.getByText("Отклонено").first()).toBeVisible();
  });

  test("an owner hands one session to a substitute, who sees the participants and can log the workout", async ({ persona }) => {
    const { owner, colleague, coachingId } = await team(persona);
    const ownerName = `Марина ${owner.lastName}`;
    const colleagueName = `Денис ${colleague.lastName}`;
    const created = ok(
      await owner.db.rpc("create_session", { p_coaching_id: coachingId, p_starts_at: moscowAt(2, 10), p_duration_min: 60, p_mode: "online" }),
      "session",
    );
    const sessionId = created[0].session_id;

    const { page } = owner;
    await page.goto(`/trainer/sessions/${sessionId}`);
    await expect(page.getByRole("heading", { name: "Подмена" })).toBeVisible();
    await page.getByRole("button", { name: "Передать на подмену" }).click();
    const link = await inviteLinkPath(page);
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByText("Ждём, пока тренер примет приглашение")).toBeVisible();
    await expectAccessible(page);

    const sub = colleague.page;
    await sub.goto(link);
    await expect(sub.getByText(new RegExp(`Тренер ${ownerName} просит провести занятие`))).toBeVisible();
    await expect(sub.getByText(/Участники, отметка посещений, логи тренировок и анкета/)).toBeVisible();
    await expectAccessible(sub);
    await sub.getByRole("button", { name: "Принять" }).click();
    await expectToast(sub, "Приглашение принято");
    await sub.getByRole("link", { name: new RegExp(`От тренера ${ownerName}`) }).click();
    await expect(sub).toHaveURL(new RegExp(`/trainer/team/sessions/${sessionId}$`));
    await expect(sub.getByText(`Занятие тренера ${ownerName}`)).toBeVisible();
    await expect(sub.getByRole("heading", { name: "Участники" })).toBeVisible();
    await expect(sub.getByText("Отметить можно после начала занятия.")).toBeVisible();
    await expect(sub.getByRole("button", { name: /на занятии/ })).toHaveCount(0);
    await expectAccessible(sub);

    await sub.getByRole("link", { name: "Полина Клиентская" }).click();
    await expect(sub).toHaveURL(new RegExp(`/trainer/team/sessions/${sessionId}/bookings/`));
    await expect(sub.getByRole("heading", { level: 1, name: "Участник" })).toBeVisible();
    await expect(sub.getByRole("heading", { name: "Тренировка за это занятие" })).toBeVisible();
    await expectAccessible(sub);
    await sub.getByRole("link", { name: "Анкета" }).click();
    await expect(sub.getByText(/Анкеты нет|Клиент ещё не заполнил анкету/).first()).toBeVisible();
    await expectAccessible(sub);
    await sub.goBack();
    await sub.getByRole("link", { name: "Записать тренировку" }).click();
    await expect(sub.getByRole("heading", { level: 1, name: "Новая тренировка" })).toBeVisible();
    await sub.getByRole("button", { name: "Сохранить" }).click();
    await expect(sub.getByText("Добавь хотя бы одно упражнение")).toBeVisible();
    await expectAccessible(sub);

    // The owner sees who runs the session; once revoked, the substitute's page closes quietly.
    await page.goto(`/trainer/sessions/${sessionId}`);
    await expect(page.getByText(`Занятие проведёт ${colleagueName}`)).toBeVisible();
    await page.goto("/trainer/team");
    await page.getByRole("button", { name: `Отозвать: ${colleagueName}` }).click();
    await expectToast(page, "Доступ отозван");
    await sub.goto(`/trainer/team/sessions/${sessionId}`);
    await expect(sub.getByRole("heading", { name: "Занятие недоступно" })).toBeVisible();
    await expectAccessible(sub);
  });

  test("the substitute link stays on screen until the owner closes the sheet", async ({ persona }) => {
    test.fixme(true, "createSubstitute's refresh() swaps SubstituteButton for the pending row, unmounting the sheet with the one-time link");
    const { owner, coachingId } = await team(persona);
    const created = ok(
      await owner.db.rpc("create_session", { p_coaching_id: coachingId, p_starts_at: moscowAt(2, 12), p_duration_min: 60, p_mode: "online" }),
      "session",
    );
    await owner.page.goto(`/trainer/sessions/${created[0].session_id}`);
    await owner.page.getByRole("button", { name: "Передать на подмену" }).click();
    await inviteLinkPath(owner.page);
    await owner.page.waitForTimeout(2000);
    await expect(owner.page.getByRole("dialog", { name: "Ссылка-приглашение" })).toBeVisible();
  });
});
