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
});
