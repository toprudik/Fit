import { describe, expect, it } from "vitest";
import { escapeHtml, renderMessage } from "./messages";

const PAIR = "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const row = { kind: "bot_test" as const, locale: "ru" as const, time_zone: "Europe/Moscow", payload: {} };

describe("renderMessage", () => {
  it("writes in the recipient's language", () => {
    expect(renderMessage(row, { appUrl: "https://fit.example", group: false })?.text).toMatch(/^Готово/);
    expect(renderMessage({ ...row, locale: "en" }, { appUrl: "https://fit.example", group: false })?.text).toMatch(/^Done/);
  });

  it("opens the Mini App with the source mark in a private chat", () => {
    expect(renderMessage(row, { appUrl: "https://fit.example", group: false })?.buttons).toEqual([
      { text: "Открыть DaFit", web_app: { url: "https://fit.example/?source=bot_test" } },
    ]);
  });

  it("uses a plain link in a group, where Telegram allows no Mini App buttons", () => {
    expect(renderMessage(row, { appUrl: "https://fit.example", group: true })?.buttons).toEqual([
      { text: "Открыть DaFit", url: "https://fit.example/?source=bot_test" },
    ]);
  });

  it("sends a trainer's broadcast as typed, escaped, under the trainer's name (wave-2 §6.9)", () => {
    const base = { ...row, kind: "trainer_broadcast" as const };
    const payload = { trainer_name: "Иван", body: "Завтра в <10>", button_kind: "deep_link" };
    expect(renderMessage({ ...base, payload }, { appUrl: "https://fit.example", group: false })).toEqual({
      text: "<b>Сообщение от тренера Иван</b>\nЗавтра в &lt;10&gt;",
      buttons: [{ text: "Открыть DaFit", web_app: { url: "https://fit.example/client?source=trainer_broadcast" } }],
    });
    const link = { ...payload, button_kind: "url", button_url: "https://example.com/plan" };
    expect(renderMessage({ ...base, payload: link }, { appUrl: "https://fit.example", group: false })?.buttons).toEqual([
      { text: "Открыть ссылку", url: "https://example.com/plan" },
    ]);
    const unsafe = { ...payload, button_kind: "url", button_url: "javascript:alert(1)" };
    expect(renderMessage({ ...base, payload: unsafe }, { appUrl: "https://fit.example", group: false })?.buttons).toEqual([]);
  });

  it("drops buttons for a local http app URL, which Telegram would refuse", () => {
    expect(renderMessage(row, { appUrl: "http://localhost:3000", group: false })?.buttons).toEqual([]);
  });

  it("tells the trainer about a new client by name, escaped, with a button to the client card", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", payload: { coaching_id: PAIR, first_name: "Анна", last_name: "<Смирнова>" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Новый клиент: Анна &lt;Смирнова&gt;",
      buttons: [{ text: "Открыть клиента", web_app: { url: `https://fit.example/trainer/clients/${PAIR}?source=coaching_created` } }],
    });
  });

  it("opens the client list when the pair id is not a uuid", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", payload: { coaching_id: "../admin", first_name: "Анна" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.buttons).toEqual([
      { text: "Открыть клиента", web_app: { url: "https://fit.example/trainer/clients?source=coaching_created" } },
    ]);
  });

  it("names a client without a name neutrally", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_created", locale: "en", payload: { first_name: null, last_name: " " } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("New client: a client with no name");
  });

  it("asks the trainer with cards to check them when someone joins", () => {
    const message = renderMessage(
      { ...row, kind: "managed_client_claim", payload: { claim_id: "c1", first_name: "Иван" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Иван теперь среди твоих клиентов. Проверь, нет ли у тебя карточки этого человека без аккаунта.");
    expect(message?.buttons).toEqual([{ text: "Открыть клиентов", web_app: { url: "https://fit.example/trainer/clients?source=managed_client_claim" } }]);
  });

  it("opens the claim itself when the payload names it (Т7a)", () => {
    const message = renderMessage(
      { ...row, kind: "managed_client_claim", payload: { claim_id: PAIR, first_name: "Иван" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.buttons).toEqual([
      { text: "Ответить", web_app: { url: `https://fit.example/trainer/clients/claims/${PAIR}?source=managed_client_claim` } },
    ]);
  });

  it("tells the person a Free trainer has no place for them (К12)", () => {
    const message = renderMessage(
      {
        ...row,
        kind: "coaching_ended",
        payload: { coaching_id: PAIR, ended_by: "trainer", cancelled: 0, first_name: "Иван", reason: "plan_limit_reached" },
      },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Тренер Иван сейчас не может добавить новых клиентов на бесплатном тарифе, поэтому занятия не начались. Когда место освободится, открой ссылку тренера ещё раз.",
      buttons: [{ text: "Открыть тренера", web_app: { url: `https://fit.example/client/trainers/${PAIR}?source=coaching_ended` } }],
    });
  });

  it("tells the trainer a client left, with the number of cancelled sessions (Т9)", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_ended", payload: { coaching_id: PAIR, ended_by: "client", cancelled: 2, first_name: "Анна" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Анна больше не занимается у тебя. Будущих занятий отменено: 2.",
      buttons: [{ text: "Открыть клиента", web_app: { url: `https://fit.example/trainer/clients/${PAIR}?source=coaching_ended` } }],
    });
  });

  it("leaves the count out when no session was cancelled", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_ended", locale: "en", payload: { ended_by: "client", cancelled: 0, first_name: "Ann" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Ann no longer trains with you.");
  });

  it("tells the client the trainer ended the pair and opens the client zone", () => {
    const message = renderMessage(
      { ...row, kind: "coaching_ended", payload: { coaching_id: PAIR, ended_by: "trainer", cancelled: 1, first_name: "Иван" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message).toEqual({
      text: "Занятия с тренером Иван завершены. Будущие записи отменены без списаний.",
      buttons: [{ text: "Открыть тренера", web_app: { url: `https://fit.example/client/trainers/${PAIR}?source=coaching_ended` } }],
    });
  });

  it("returns null for a type without a template yet", () => {
    expect(renderMessage({ ...row, kind: "review_prompt" }, { appUrl: "https://fit.example", group: false })).toBeNull();
  });
});

describe("verification messages", () => {
  const options = { appUrl: "https://fit.example", group: false };

  it("tells a verified trainer about the badge and opens the verification screen (С3)", () => {
    const message = renderMessage({ ...row, kind: "verification_result", payload: { decision: "verified" } }, options);
    expect(message?.text).toMatch(/^Верификация пройдена/);
    expect(message?.buttons).toEqual([
      { text: "Открыть верификацию", web_app: { url: "https://fit.example/trainer/verification?source=verification_result" } },
    ]);
  });

  it("gives a rejected trainer the reason, escaped", () => {
    const message = renderMessage(
      { ...row, kind: "verification_result", payload: { decision: "rejected", reason: "Скан <нечитаемый>" } },
      options,
    );
    expect(message?.text).toContain("причина: «Скан &lt;нечитаемый&gt;»");
  });

  it("names the trainer and the number of documents for the admin group (А1)", () => {
    const message = renderMessage(
      { ...row, kind: "verification_submitted", payload: { trainer_name: "Ivan & Co", documents: 3 } },
      { ...options, group: true },
    );
    expect(message?.text).toBe("Новая заявка на верификацию: Ivan &amp; Co, документов: 3.");
    expect(message?.buttons).toEqual([{ text: "Открыть очередь", url: "https://fit.example/admin/verification?source=verification_submitted" }]);
  });
});

describe("feedback message (А2)", () => {
  const options = { appUrl: "https://fit.example", group: true };
  const id = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

  it("gives the kind, the zone, the text and the screenshots, and opens the feedback", () => {
    const message = renderMessage(
      { ...row, kind: "feedback_received", payload: { feedback_id: id, kind: "bug", zone: "client", excerpt: "Кнопка <не> жмётся", screenshots: 2 } },
      options,
    );
    expect(message?.text).toBe("Новое обращение, ошибка, зона клиента:\n«Кнопка &lt;не&gt; жмётся»\n2 скриншота");
    expect(message?.buttons).toEqual([{ text: "Открыть обращение", url: `https://fit.example/admin/feedback/${id}?source=feedback_received` }]);
  });

  it("leaves out screenshots it doesn't have and falls back on an unknown zone", () => {
    const message = renderMessage(
      { ...row, kind: "feedback_received", locale: "en", payload: { feedback_id: "nope", kind: "idea", zone: null, excerpt: "Dark mode", screenshots: 0 } },
      options,
    );
    expect(message?.text).toBe("New feedback, idea, zone unknown:\n“Dark mode”");
    expect(message?.buttons[0]).toEqual({ text: "Open feedback", url: "https://fit.example/admin/feedback?source=feedback_received" });
  });
});

describe("intake messages", () => {
  const PAIR = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
  const options = { appUrl: "https://fit.example", group: false };

  it("tells the trainer about a new intake and opens it (Т8)", () => {
    const message = renderMessage(
      { ...row, kind: "intake_submitted", payload: { coaching_id: PAIR, first_name: "Анна", parq_flagged: false } },
      options,
    );
    expect(message).toEqual({
      text: "Новая анкета: Анна.",
      buttons: [{ text: "Открыть анкету", web_app: { url: `https://fit.example/trainer/clients/${PAIR}/intake?source=intake_submitted` } }],
    });
  });

  it("points out a yes in PAR-Q", () => {
    const message = renderMessage(
      { ...row, kind: "intake_submitted", locale: "en", payload: { coaching_id: PAIR, first_name: "Anna", parq_flagged: true } },
      options,
    );
    expect(message?.text).toBe("New intake form from Anna. There's a yes in PAR-Q, so read it before the session.");
  });

  it("asks the client to fill in the intake on the trainer's behalf", () => {
    const message = renderMessage(
      { ...row, kind: "intake_reminder", payload: { coaching_id: PAIR, first_name: "Олег", last_name: "<Б>" } },
      options,
    );
    expect(message).toEqual({
      text: "Олег &lt;Б&gt; просит заполнить анкету: так тренер заранее узнает о твоих целях и здоровье.",
      buttons: [{ text: "Заполнить анкету", web_app: { url: `https://fit.example/client/trainers/${PAIR}/intake?source=intake_reminder` } }],
    });
  });

  it("says Your trainer when the trainer has no name", () => {
    const message = renderMessage({ ...row, kind: "intake_reminder", locale: "en", payload: { coaching_id: PAIR } }, options);
    expect(message?.text).toMatch(/^Your trainer asks you/);
  });
});

describe("escapeHtml", () => {
  it("escapes what parse_mode HTML treats as markup", () => {
    expect(escapeHtml(`<b>"Tom" & Jerry</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  });
});

describe("plan messages", () => {
  const options = { appUrl: "https://fit.example", group: false };

  it("names the plan and its last day in the recipient's zone and language (PLAN-5)", () => {
    const payload = { plan: "trainer_pro", expires_at: "2026-11-30T20:59:59Z" };
    expect(renderMessage({ ...row, kind: "plan_granted", payload }, options)?.text).toBe(
      "Тебе выдан тариф Pro до 30 ноября 2026. Спасибо, что ты в бете DaFit.",
    );
    expect(renderMessage({ ...row, kind: "plan_granted", locale: "en", payload }, options)?.text).toBe(
      "You now have Pro until November 30, 2026. Thanks for being in the DaFit beta.",
    );
  });

  it("says when a plan has no end, and opens My plan", () => {
    const message = renderMessage({ ...row, kind: "plan_granted", payload: { plan: "client_premium", expires_at: null } }, options);
    expect(message?.text).toBe("Тебе выдан тариф Premium без срока. Спасибо, что ты в бете DaFit.");
    expect(message?.buttons).toEqual([
      { text: "Открыть тариф", web_app: { url: "https://fit.example/settings/plan?source=plan_granted" } },
    ]);
  });

  it("tells about a revoked plan and one ending in three days", () => {
    expect(renderMessage({ ...row, kind: "plan_revoked", payload: { plan: "trainer_pro" } }, options)?.text).toBe(
      "Тариф Pro отключён. Все твои данные на месте.",
    );
    expect(
      renderMessage({ ...row, kind: "plan_expiring", payload: { plan: "client_premium", expires_at: "2026-11-30T20:59:59Z" } }, options)?.text,
    ).toBe("Тариф Premium закончится 30 ноября 2026. Если он ещё нужен, запроси доступ в разделе «Мой тариф».");
  });

  describe("session_reminder (К7)", () => {
    const BOOKING = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
    const options = { appUrl: "https://fit.example", group: false };
    const payload = {
      booking_id: BOOKING,
      starts_at: "2026-10-22T15:30:00Z",
      kind: "personal",
      title: null,
      mode: "offline",
      location_name: "Зал на Ленина",
      location_address: "ул. Ленина, 1",
      first_name: "Давид",
      last_name: "Р.",
      offset_min: 60,
    };

    it("says how soon, when, with whom and where, with a button to the booking", () => {
      expect(renderMessage({ ...row, kind: "session_reminder", payload }, options)).toEqual({
        text: "Через 1 час занятие с тренером Давид Р., чт, 22 окт., 18:30.\nМесто: Зал на Ленина, ул. Ленина, 1.",
        buttons: [{ text: "Открыть занятие", web_app: { url: `https://fit.example/client/sessions?booking=${BOOKING}&source=session_reminder` } }],
      });
    });

    it("keeps the meeting link out of an online reminder and names a group session", () => {
      const online = { ...payload, kind: "group", title: "<Йога>", mode: "online", offset_min: 1440, meeting_url: "https://meet.example/x" };
      const message = renderMessage({ ...row, locale: "en", kind: "session_reminder", payload: online }, options);
      expect(message?.text).toMatch(
        /^The group session \u201c&lt;Йога&gt;\u201d with Давид Р\. starts in 1 day, Thu, Oct 22, 6:30\sPM\.\nThe session is online, the link is in DaFit\.$/,
      );
      expect(message?.text).not.toContain("meet.example");
    });

    it("writes the lead time in the right plural form", () => {
      const text = (offset_min: number) => renderMessage({ ...row, kind: "session_reminder", payload: { ...payload, offset_min } }, options)?.text;
      expect(text(15)).toMatch(/^Через 15 минут /);
      expect(text(180)).toMatch(/^Через 3 часа /);
      expect(text(4320)).toMatch(/^Через 3 дня /);
      expect(text(21)).toMatch(/^Через 21 минуту /);
    });
  });

  describe("sessions the trainer assigns, changes and cancels", () => {
    const options = { appUrl: "https://fit.example", group: false };
    const trainer = { first_name: "Иван", last_name: "Петров" };

    it("tells the client about one new session in their own zone", () => {
      const message = renderMessage(
        {
          ...row,
          kind: "booking_assigned",
          time_zone: "Asia/Yekaterinburg",
          payload: {
            ...trainer,
            starts_at: "2026-10-26T15:00:00Z",
            mode: "offline",
            location: "Зал на Ленина",
            count: 1,
            until: null,
          },
        },
        options,
      );
      expect(message?.text).toMatch(/^Новое занятие с тренером Иван Петров: .*26 октября.*20:00, Зал на Ленина\.$/);
      expect(message?.buttons).toEqual([
        {
          text: "Открыть занятия",
          web_app: {
            url: "https://fit.example/client/sessions?source=booking_assigned",
          },
        },
      ]);
    });

    it("sends one message for a whole repeat", () => {
      const counted = renderMessage(
        {
          ...row,
          kind: "booking_assigned",
          locale: "en",
          payload: {
            ...trainer,
            starts_at: "2026-10-26T15:00:00Z",
            mode: "online",
            count: 8,
          },
        },
        options,
      );
      expect(counted?.text).toMatch(/^New sessions with Иван Петров, 8 in total\. First one: .*, online\.$/);
      const until = renderMessage(
        {
          ...row,
          kind: "booking_assigned",
          payload: {
            ...trainer,
            starts_at: "2026-10-26T15:00:00Z",
            mode: "offline",
            count: 3,
            until: "2026-12-31",
          },
        },
        options,
      );
      expect(until?.text).toMatch(/^Новые занятия с тренером Иван Петров до 31 декабря 2026\. Первое: .*, очно\.$/);
    });

    it("shows a move as before and after, and a change of place on its own", () => {
      const moved = renderMessage(
        {
          ...row,
          kind: "session_changed",
          payload: {
            ...trainer,
            before_starts_at: "2026-10-26T15:00:00Z",
            starts_at: "2026-10-26T16:30:00Z",
            mode: "online",
            count: 1,
          },
        },
        options,
      );
      expect(moved?.text).toMatch(/^Занятие с тренером Иван Петров перенесено: было .*18:00, стало .*19:30, онлайн\.$/);
      const changed = renderMessage(
        {
          ...row,
          kind: "session_changed",
          payload: {
            ...trainer,
            before_starts_at: "2026-10-26T15:00:00Z",
            starts_at: "2026-10-26T15:00:00+00:00",
            mode: "online",
            count: 3,
          },
        },
        options,
      );
      expect(changed?.text).toMatch(/^Занятия с тренером Иван Петров изменены, всего 3\. Начиная с .*, теперь онлайн\.$/);
    });

    it("lists the cancelled dates with the reason, escaped, and cuts a long list", () => {
      const dates = Array.from({ length: 7 }, (_, week) => new Date(Date.UTC(2026, 9, 26 + week * 7, 15)).toISOString());
      const message = renderMessage(
        {
          ...row,
          kind: "booking_cancelled_by_trainer",
          payload: { ...trainer, dates, reason: "Болею <сильно>" },
        },
        options,
      );
      expect(message?.text).toMatch(
        /^Занятия с тренером Иван Петров отменены: .*; и ещё 2\. Причина: «Болею &lt;сильно&gt;»\. Списаний не будет\.$/,
      );
      expect(message?.text.split("; ")).toHaveLength(6);
      const one = renderMessage(
        {
          ...row,
          kind: "booking_cancelled_by_trainer",
          locale: "en",
          payload: { dates: [dates[0]], reason: "Sick" },
        },
        options,
      );
      expect(one?.text).toMatch(/^Your session with your trainer is cancelled: .*\. Reason: “Sick”\. Nothing is charged\.$/);
    });
  });

  describe("daily_digest (NOTIF-5)", () => {
    const options = { appUrl: "https://fit.example", group: false };
    const payload = {
      day: "2026-10-22",
      sessions: [
        { starts_at: "2026-10-22T07:00:00Z", kind: "personal", title: null, name: "Катя", booked: 1 },
        { starts_at: "2026-10-22T15:00:00Z", kind: "group", title: "Функционалка", name: null, booked: 5 },
      ],
      sessions_count: 3,
      requests_count: 2,
      passes: [
        { name: "Катя", available: 1, expires_at: null },
        { name: "Борис", available: 4, expires_at: "2026-10-25T21:00:00Z" },
      ],
      passes_count: 2,
      debts: [{ name: "<Вера>", sessions: 2 }],
      debts_count: 1,
    };

    it("lists today's sessions, requests, passes running out and debts, with a button to Today", () => {
      expect(renderMessage({ ...row, kind: "daily_digest", payload }, options)).toEqual({
        text: [
          "Сводка на 22 октября",
          "",
          "Сегодня 3 занятия:",
          "• 10:00, Катя",
          "• 18:00, Функционалка, записались: 5",
          "• и ещё 1",
          "",
          "2 запроса на запись ждут ответа.",
          "",
          "Абонементы на исходе:",
          "• Катя, осталось 1 занятие",
          "• Борис, до 26 окт.",
          "",
          "Долги:",
          "• &lt;Вера&gt;, 2 занятия",
        ].join("\n"),
        buttons: [{ text: "Открыть «Сегодня»", web_app: { url: "https://fit.example/trainer?source=daily_digest" } }],
      });
    });

    it("says there are no sessions when only other parts have news", () => {
      const text = renderMessage(
        { ...row, locale: "en", kind: "daily_digest", payload: { day: "2026-10-22", sessions: [], sessions_count: 0, requests_count: 1 } },
        options,
      )?.text;
      expect(text).toBe("Your day, October 22\n\nNo sessions today.\n\n1 booking request is waiting for your answer.");
    });
  });

  describe("client bookings and requests", () => {
    const options = { appUrl: "https://fit.example", group: false };
    const client = { first_name: "Анна", last_name: "Смирнова" };
    const booking = "1f2e3d4c-5b6a-4987-8a6b-5c4d3e2f1a0b";
    const base = { booking_id: booking, session_id: PAIR, starts_at: "2026-10-27T07:00:00Z", mode: "offline", location: "Зал" };

    it("tells the trainer about a booking, on debt too, and a request with a button to answer", () => {
      const created = renderMessage({ ...row, kind: "booking_created", payload: { ...client, ...base, debt: false } }, options);
      expect(created?.text).toMatch(/^Новая запись: Анна Смирнова, .*10:00, Зал\.$/);
      expect(created?.buttons[0]).toEqual({ text: "Открыть занятие", web_app: { url: `https://fit.example/trainer/sessions/${PAIR}?source=booking_created` } });
      const debt = renderMessage({ ...row, kind: "booking_created", payload: { ...client, ...base, debt: true } }, options);
      expect(debt?.text).toMatch(/занятие уйдёт в долг\.$/);
      const requested = renderMessage({ ...row, kind: "booking_requested", locale: "en", payload: { ...base } }, options);
      expect(requested?.text).toMatch(/^Booking request: a client with no name, .*, Зал\. Confirm or decline it before the session starts\.$/);
      expect(requested?.buttons[0]).toEqual({
        text: "Answer the request",
        web_app: { url: `https://fit.example/trainer/requests/${booking}?source=booking_requested` },
      });
      const trial = renderMessage({ ...row, kind: "booking_requested", payload: { ...client, ...base, trial: true } }, options);
      expect(trial?.text).toMatch(/^Запрос на пробное: Анна Смирнова, .*, Зал\. Подтверди или отклони его до начала занятия\.$/);
      const onSite = renderMessage({ ...row, kind: "booking_requested", payload: { ...client, ...base, on_site: true } }, options);
      expect(onSite?.text).toMatch(/^Запрос на место: Анна Смирнова на занятии .*, Зал, но без записи\. Подтверди или отклони его\.$/);
    });

    it("tells the trainer a request was withdrawn", () => {
      const withdrawn = renderMessage({ ...row, kind: "booking_cancelled_by_client", payload: { ...client, ...base, request: true } }, options);
      expect(withdrawn?.text).toMatch(/^Запрос на .* отозван, клиент: Анна Смирнова\.$/);
    });

    it("tells the trainer about a client cancellation, a late one and its escaped reason", () => {
      const free = renderMessage({ ...row, kind: "booking_cancelled_by_client", payload: { ...client, ...base, late: false } }, options);
      expect(free?.text).toMatch(/^Запись на .* отменена, клиент: Анна Смирнова\.$/);
      const late = renderMessage(
        { ...row, kind: "booking_cancelled_by_client", payload: { ...client, ...base, late: true, reason: "Заболел <сильно>" } },
        options,
      );
      expect(late?.text).toMatch(/^Запись на .* отменена позже срока, клиент: Анна Смирнова\. Занятие списано\.\nПричина: Заболел &lt;сильно&gt;$/);
      expect(late?.buttons[0]).toEqual({
        text: "Простить",
        web_app: { url: `https://fit.example/trainer/sessions/${PAIR}?action=waive&booking=${booking}&source=booking_cancelled_by_client` },
      });
      expect(free?.buttons[0].text).toBe("Открыть расписание");
    });

    it("tells the trainer about a move, confirmed or as a request", () => {
      const from = "2026-10-26T07:00:00Z";
      const moved = renderMessage({ ...row, kind: "booking_rescheduled", payload: { ...client, ...base, rescheduled_from: from } }, options);
      expect(moved?.text).toMatch(/^Перенос записи: Анна Смирнова, с .*26 октября.* на .*27 октября.*, Зал\.$/);
      expect(moved?.buttons[0]).toEqual({
        text: "Открыть занятие",
        web_app: { url: `https://fit.example/trainer/sessions/${PAIR}?source=booking_rescheduled` },
      });
      const request = renderMessage(
        { ...row, kind: "booking_requested", locale: "en", payload: { ...client, ...base, rescheduled_from: from } },
        options,
      );
      expect(request?.text).toMatch(/^Request to move: Анна Смирнова, from .* to .*, Зал\. Confirm or decline it before the session starts\.$/);
    });

    it("tells the client the answer, with the decline reason escaped, or that none came", () => {
      const trainer = { first_name: "Иван", last_name: "Петров" };
      const confirmed = renderMessage({ ...row, kind: "booking_confirmed", payload: { ...trainer, ...base } }, options);
      expect(confirmed?.text).toMatch(/^Запись к тренеру Иван Петров на .* подтверждена\.$/);
      expect(confirmed?.buttons[0].text).toBe("Открыть запись");
      const declined = renderMessage({ ...row, kind: "booking_declined", payload: { ...trainer, ...base, reason: "Зал <закрыт>" } }, options);
      expect(declined?.text).toMatch(/^Запрос к тренеру Иван Петров на .* отклонён\. Причина: «Зал &lt;закрыт&gt;»\.$/);
      const bare = renderMessage({ ...row, kind: "booking_declined", locale: "en", payload: { ...base, reason: null } }, options);
      expect(bare?.text).toMatch(/^Your request to your trainer for .* was declined\.$/);
      const expired = renderMessage({ ...row, kind: "booking_expired", payload: { ...trainer, ...base } }, options);
      expect(expired?.text).toMatch(/остался без ответа, запись не состоялась\.$/);
    });
  });
});

describe("payment_reported", () => {
  it("tells the trainer who paid how much for which pass, with a button to the client's payments", () => {
    const message = renderMessage(
      {
        ...row,
        kind: "payment_reported",
        payload: { coaching_id: PAIR, amount_minor: 1_800_000, currency: "RUB", pass_title: "10 <занятий>", first_name: "Анна" },
      },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Анна сообщает об оплате 18 000 ₽ за «10 &lt;занятий&gt;». Подтверди, когда деньги придут.");
    expect(message?.buttons).toEqual([
      { text: "Открыть оплаты", web_app: { url: `https://fit.example/trainer/clients/${PAIR}/payments?source=payment_reported` } },
    ]);
  });

  it("leaves the pass out of a payment on account and falls back to the money screen", () => {
    const message = renderMessage(
      { ...row, kind: "payment_reported", locale: "en", payload: { amount_minor: 50_000, currency: "USD", first_name: "Ann" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Ann says they paid $500. Confirm it once the money arrives.");
    expect(message?.buttons[0]).toEqual({ text: "Open payments", web_app: { url: "https://fit.example/trainer/money?source=payment_reported" } });
  });
});

describe("goal_changed", () => {
  it("tells the trainer the new goal and opens the client's nutrition tab (wave-2 §1.3)", () => {
    const message = renderMessage(
      { ...row, kind: "goal_changed", payload: { coaching_id: PAIR, goal: "gain", previous_goal: "lose", first_name: "Анна" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("У клиента Анна новая цель: «набрать массу». Твоя норма осталась прежней, проверь, подходит ли она.");
    expect(message?.buttons).toEqual([
      { text: "Открыть питание", web_app: { url: `https://fit.example/trainer/clients/${PAIR}/nutrition?source=goal_changed` } },
    ]);
  });
});

describe("trainer_comment", () => {
  it("quotes the comment and opens that day of the food diary (wave-2 §3.12)", () => {
    const message = renderMessage(
      { ...row, kind: "trainer_comment", payload: { day: "2026-10-17", body: "Добавь <белка>", first_name: "Анна", last_name: "Тренер" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toBe("Комментарий тренера Анна Тренер к твоему питанию за 17 октября: «Добавь &lt;белка&gt;»");
    expect(message?.buttons).toEqual([
      { text: "Открыть день", web_app: { url: "https://fit.example/client/diary/food?day=2026-10-17&source=trainer_comment" } },
    ]);
  });
});

describe("account messages", () => {
  const app = { appUrl: "https://fit.example", group: false };

  it("gives the deletion date and a button to cancel (PRIV-7)", () => {
    const message = renderMessage(
      { ...row, kind: "account_deletion", payload: { stage: "requested", scheduled_for: "2026-11-15T21:30:00Z" } },
      app,
    );
    expect(message?.text).toBe(
      "Аккаунт DaFit будет удалён 16 ноября 2026. Будущие записи отменены без списаний. Если передумаешь, открой DaFit и отмени удаление до этого дня.",
    );
    expect(message?.buttons).toEqual([
      { text: "Отменить удаление", web_app: { url: "https://fit.example/settings/delete?source=account_deletion" } },
    ]);
  });

  it("confirms a cancelled deletion", () => {
    expect(renderMessage({ ...row, kind: "account_deletion", payload: { stage: "cancelled" } }, app)?.text).toBe(
      "Удаление аккаунта отменено, всё осталось на месте.",
    );
  });

  it("tells the trainer a client is leaving, with the cancelled bookings, and opens the card", () => {
    const message = renderMessage(
      {
        ...row,
        kind: "counterpart_deleting",
        payload: { coaching_id: PAIR, side: "client", first_name: "Анна", cancelled: 2, scheduled_for: "2026-11-15T21:30:00Z" },
      },
      app,
    );
    expect(message?.text).toBe(
      "Анна удаляет аккаунт в DaFit. Будущих записей отменено: 2. Занятия, абонементы и оплаты останутся у тебя, а с 16 ноября 2026 клиент будет называться «Удалённый клиент».",
    );
    expect(message?.buttons[0]).toEqual({
      text: "Открыть клиента",
      web_app: { url: `https://fit.example/trainer/clients/${PAIR}?source=counterpart_deleting` },
    });
  });

  it("tells the client their trainer is leaving", () => {
    const message = renderMessage(
      { ...row, locale: "en", kind: "counterpart_deleting", payload: { coaching_id: PAIR, side: "trainer", first_name: "Ivan" } },
      app,
    );
    expect(message?.text).toMatch(/^Your trainer Ivan is deleting/);
    expect(message?.buttons[0]).toMatchObject({ web_app: { url: `https://fit.example/client/trainers/${PAIR}?source=counterpart_deleting` } });
  });

  it("sends the export screen, not a download link", () => {
    const message = renderMessage({ ...row, kind: "export_ready", payload: { expires_at: "2026-10-23T10:00:00Z" } }, app);
    expect(message?.text).toBe("Архив с твоими данными готов. Скачать его можно до 23 октября 2026.");
    expect(message?.buttons).toEqual([
      { text: "Скачать архив", web_app: { url: "https://fit.example/settings/export?source=export_ready" } },
    ]);
  });
});

describe("waitlist messages", () => {
  const options = { appUrl: "https://fit.example", group: false };
  const payload = {
    entry_id: PAIR,
    title: "Йога",
    starts_at: "2026-10-26T15:00:00Z",
    mode: "offline",
    location: "Студия",
    expires_at: "2026-10-20T09:30:00Z",
    first_name: "Анна",
    last_name: "Смирнова",
  };

  it("offers the freed seat with its deadline in the client's zone and opens the offer", () => {
    const message = renderMessage({ ...row, kind: "waitlist_offer", payload }, options);
    expect(message?.text).toBe("Освободилось место на «Йога» у тренера Анна Смирнова: пн, 26 октября в 18:00, Студия. Место ждёт тебя до 12:30.");
    expect(message?.buttons).toEqual([
      { text: "Ответить", web_app: { url: `https://fit.example/client/waitlist/${PAIR}?source=waitlist_offer` } },
    ]);
  });

  it("tells the queue the seat never freed, or that the session was cancelled", () => {
    expect(renderMessage({ ...row, kind: "waitlist_closed", payload: { ...payload, reason: "started" } }, options)?.text).toMatch(
      /так и не освободилось/,
    );
    expect(renderMessage({ ...row, kind: "waitlist_closed", payload: { ...payload, reason: "cancelled" } }, options)?.text).toMatch(
      /отменено/,
    );
  });
});

describe("charge_posted and charge_waived", () => {
  const STARTS = "2026-10-20T15:00:00Z";

  it("tells the client a no-show took a session from the pass, with a button to it", () => {
    const message = renderMessage(
      {
        ...row,
        kind: "charge_posted",
        payload: { reason: "no_show", starts_at: STARTS, pass_id: PAIR, pass_title: "10 занятий", remaining: 7, first_name: "Олег" },
      },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toContain("отмечено как неявка. Списано 1 занятие из «10 занятий», осталось 7.");
    expect(message?.buttons).toEqual([
      { text: "Открыть абонемент", web_app: { url: `https://fit.example/client/passes/${PAIR}?source=charge_posted` } },
    ]);
  });

  it("names the debt when a late cancellation found no pass", () => {
    const message = renderMessage(
      { ...row, kind: "charge_posted", payload: { reason: "late_cancel", starts_at: STARTS, debt_sessions: 2 } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toContain("Абонемента не было, занятие ушло в долг: 2 занятия.");
    expect(message?.buttons[0]).toEqual({ text: "Открыть абонемент", web_app: { url: "https://fit.example/client/passes?source=charge_posted" } });
  });

  it("says a forgiven debt is gone", () => {
    const message = renderMessage(
      { ...row, kind: "charge_waived", locale: "en", payload: { reason: "attended", starts_at: STARTS, debt_sessions: 0, first_name: "Oleg" } },
      { appUrl: "https://fit.example", group: false },
    );
    expect(message?.text).toMatch(/^Oleg forgave the session on .+\. You owe nothing now\.$/);
  });
});

describe("contact requests", () => {
  const REQUEST = "5a1e3cc4-e5f3-4d31-9cc0-9cf56a876699";
  const options = { appUrl: "https://fit.example", group: false };

  it("asks the client on behalf of the trainer, with both answers on the answer screen", () => {
    const message = renderMessage(
      { ...row, kind: "contact_request", payload: { request_id: REQUEST, coaching_id: PAIR, side: "trainer", first_name: "Анна" } },
      options,
    );
    expect(message?.text).toMatch(/^Тренер Анна просит связаться с тобой\./);
    const url = `https://fit.example/contact/${REQUEST}?source=contact_request`;
    expect(message?.buttons).toEqual([
      { text: "Поделиться контактом", web_app: { url } },
      { text: "Отказаться", web_app: { url } },
    ]);
  });

  it("gives the trainer the client's number and a link to the chat", () => {
    const message = renderMessage(
      {
        ...row,
        kind: "contact_response",
        payload: {
          request_id: REQUEST,
          coaching_id: PAIR,
          side: "trainer",
          accepted: true,
          first_name: "<Иван>",
          phone: "+79991234567",
          telegram_id: 4242,
        },
      },
      options,
    );
    expect(message?.text).toBe(
      'На просьбу связаться ответили. <a href="tg://user?id=4242">&lt;Иван&gt;</a>: +79991234567. Нажми на имя, чтобы открыть чат в Telegram.',
    );
    expect(message?.buttons).toEqual([
      { text: "Открыть клиента", web_app: { url: `https://fit.example/trainer/clients/${PAIR}?source=contact_response` } },
    ]);
  });

  it("tells the client the trainer declined, without a contact", () => {
    const message = renderMessage(
      {
        ...row,
        kind: "contact_response",
        locale: "en",
        payload: { coaching_id: PAIR, side: "client", accepted: false, first_name: "Anna" },
      },
      options,
    );
    expect(message?.text).toBe("Anna declined your request to get in touch.");
    expect(message?.buttons).toEqual([
      { text: "Open trainer", web_app: { url: `https://fit.example/client/trainers/${PAIR}?source=contact_response` } },
    ]);
  });
});

describe("referral bonus message", () => {
  const options = { appUrl: "https://fit.example", group: false };
  const PASS = "6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7";
  const payload = {
    pass_id: PASS,
    sessions: 2,
    friend: { first_name: "Фёдор", last_name: null },
    trainer: { first_name: "Ирина", last_name: "Котова" },
  };

  it("tells the client who shared the link and opens the bonus pass", () => {
    const message = renderMessage({ ...row, kind: "referral_bonus", payload: { ...payload, side: "referrer" } }, options);
    expect(message?.text).toBe("Бонус за друга: Фёдор теперь занимается с тренером Ирина Котова, а у тебя +2 занятия.");
    expect(message?.buttons).toEqual([
      { text: "Открыть абонемент", web_app: { url: `https://fit.example/client/passes/${PASS}?source=referral_bonus` } },
    ]);
  });

  it("tells the friend in their language", () => {
    const message = renderMessage({ ...row, locale: "en", kind: "referral_bonus", payload: { ...payload, sessions: 1, side: "referee" } }, options);
    expect(message?.text).toBe("Invitation bonus: you get +1 session with Ирина Котова.");
  });
});

describe("homework messages (Д1, Д2)", () => {
  const HOMEWORK = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
  const app = { appUrl: "https://fit.example", group: false };

  it("reminds the client on the day with the title and the trainer's name, escaped", () => {
    const message = renderMessage(
      { ...row, kind: "homework_reminder", payload: { coaching_id: PAIR, homework_id: HOMEWORK, title: "Планка <3>", first_name: "Ира" } },
      app,
    );
    expect(message).toEqual({
      text: "Сегодня срок домашнего задания «Планка &lt;3&gt;» от тренера Ира.",
      buttons: [{ text: "Открыть задание", web_app: { url: "https://fit.example/client/sessions/homework?source=homework_reminder" } }],
    });
  });

  it("tells the trainer a homework is done, with the comment, and opens it", () => {
    const message = renderMessage(
      { ...row, kind: "homework_done", payload: { coaching_id: PAIR, homework_id: HOMEWORK, title: "Планка", name: "Анна", comment: "Тяжело" } },
      app,
    );
    expect(message).toEqual({
      text: "Анна: задание «Планка» выполнено.\nКомментарий: Тяжело",
      buttons: [
        {
          text: "Открыть задание",
          web_app: { url: `https://fit.example/trainer/clients/${PAIR}/workouts/homework/${HOMEWORK}?source=homework_done` },
        },
      ],
    });
  });

  it("leaves the comment out when there is none and falls back to the pair's workouts", () => {
    const message = renderMessage(
      { ...row, kind: "homework_done", payload: { coaching_id: PAIR, homework_id: "x", title: "Планка", name: "Анна", comment: null } },
      app,
    );
    expect(message?.text).toBe("Анна: задание «Планка» выполнено.");
    expect(message?.buttons[0]).toEqual({
      text: "Открыть задание",
      web_app: { url: `https://fit.example/trainer/clients/${PAIR}/workouts?source=homework_done` },
    });
  });
});

describe("badge messages (wave-3 §2.2-7)", () => {
  const app = { appUrl: "https://fit.example", group: false };

  it("names the new badge in the client's language and opens the badges", () => {
    expect(renderMessage({ ...row, kind: "badge", payload: { badge: "sessions_10" } }, app)).toEqual({
      text: "Новый значок: «10 занятий». 10 занятий с тренером.",
      buttons: [{ text: "Открыть значки", web_app: { url: "https://fit.example/client/progress/badges?source=badge" } }],
    });
    expect(renderMessage({ ...row, locale: "en", kind: "badge", payload: { badge: "records_1" } }, app)?.text).toBe(
      "New badge: “First record”. Your first personal record in an exercise.",
    );
  });

  it("still congratulates on a badge it doesn't know", () => {
    expect(renderMessage({ ...row, kind: "badge", payload: { badge: "unknown" } }, app)?.text).toBe("У тебя новый значок.");
  });
});
