import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/dictionaries/ru";
import { buildCalendar, escapeText, eventSummary, foldLine, icsDate, type FeedEvent } from "./ics";

const copy = ru.calendar.ics;
const event: FeedEvent = {
  uid: "0b7c2f4e-1d2a-4c3b-9e8f-7a6b5c4d3e2f",
  starts_at: "2026-10-22T15:30:00+00:00",
  ends_at: "2026-10-22T16:30:00+00:00",
  updated_at: "2026-10-16T10:00:00+00:00",
  cancelled: false,
  kind: "personal",
  title: null,
  mode: "offline",
  location_name: "Зал на Ленина",
  location_address: "ул. Ленина, 1",
  meeting_url: null,
  partner: "Анна",
};
const options = {
  copy,
  appUrl: "https://fit.example",
  now: new Date("2026-10-16T12:00:00Z"),
};

describe("ics helpers", () => {
  it("escapes RFC 5545 text", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });

  it("writes times in UTC, so the calendar shows them in the viewer's zone (CAL-1)", () => {
    expect(icsDate("2026-10-22T18:30:00+03:00")).toBe("20261022T153000Z");
  });

  it("folds long lines at 75 octets without splitting a letter", () => {
    const folded = foldLine(`SUMMARY:${"Ж".repeat(60)}`);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split("\r\n")
        .map((part, i) => (i ? part.slice(1) : part))
        .join(""),
    ).toBe(`SUMMARY:${"Ж".repeat(60)}`);
  });
});

describe("eventSummary", () => {
  it("names the client for the trainer and the trainer for the client", () => {
    expect(eventSummary(event, "trainer", copy)).toBe("Занятие: Анна");
    expect(eventSummary({ ...event, kind: "trial" }, "client", copy)).toBe("Пробное занятие с тренером Анна");
    expect(eventSummary({ ...event, kind: "group", title: "Йога" }, "trainer", copy)).toBe("Йога");
    expect(eventSummary({ ...event, kind: "group", title: "Йога" }, "client", copy)).toBe("Йога, тренер Анна");
    expect(eventSummary({ ...event, partner: null }, "client", copy)).toBe("Занятие");
  });
});

describe("buildCalendar", () => {
  const calendar = buildCalendar(
    {
      zone: "client",
      events: [
        event,
        {
          ...event,
          uid: "x",
          cancelled: true,
          mode: "online",
          meeting_url: "https://meet.example/a",
        },
      ],
    },
    options,
  );
  const lines = calendar.split("\r\n");

  it("is a published calendar with CRLF lines", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("METHOD:PUBLISH");
    expect(lines).toContain("X-WR-CALNAME:DaFit: мои занятия");
    expect(calendar.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("carries the time, the place and a link back to DaFit", () => {
    expect(lines).toContain(`UID:${event.uid}@dafit`);
    expect(lines).toContain("DTSTART:20261022T153000Z");
    expect(lines).toContain("DTEND:20261022T163000Z");
    expect(lines).toContain("DTSTAMP:20261016T100000Z");
    expect(lines).toContain("LOCATION:Зал на Ленина\\, ул. Ленина\\, 1");
    expect(lines).toContain("URL:https://fit.example/client/sessions");
    expect(lines).toContain("STATUS:CONFIRMED");
  });

  it("marks a cancelled event and puts the meeting link of an online one in the description (CAL-2)", () => {
    expect(lines).toContain("STATUS:CANCELLED");
    expect(lines).toContain("LOCATION:Онлайн");
    expect(calendar.replace(/\r\n /g, "")).toContain(
      "DESCRIPTION:Ссылка на занятие: https://meet.example/a\\nОткрыть в DaFit: https://fit.example/client/sessions",
    );
  });

  it("links the trainer feed to the schedule", () => {
    expect(buildCalendar({ zone: "trainer", events: [event] }, options)).toContain("URL:https://fit.example/trainer/schedule");
  });
});
