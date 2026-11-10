import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { isForeignRejection, scrubEvent, scrubUrl, sentryOptions } from "./sentry";

describe("sentryOptions", () => {
  it("sends no personal information, traces or breadcrumbs", () => {
    const options = sentryOptions("https://key@o1.ingest.example/1");
    expect(options).toMatchObject({
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
    });
  });
});

describe("scrubUrl", () => {
  it("keeps the route and masks ids and tokens", () => {
    expect(
      scrubUrl("https://fit.example/trainer/clients/0b7c3c3e-1f2a-4c55-9a7b-2d1e6f0a9b11/nutrition?day=2026-10-17"),
    ).toBe("/trainer/clients/:id/nutrition");
    expect(scrubUrl("/api/calendar/abcdefghijklmnopqrstuvwxyz012345.ics")).toBe("/api/calendar/:id.ics");
    expect(scrubUrl("/client/diary/food/add")).toBe("/client/diary/food/add");
    expect(scrubUrl("/client/sessions/42#top")).toBe("/client/sessions/:id");
  });
});

describe("scrubEvent", () => {
  it("drops the user, the request body, cookies, headers and query", () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: "u1", username: "someone" },
      breadcrumbs: [{ message: "fetch" }],
      extra: { body: "{}" },
      request: {
        method: "POST",
        url: "https://fit.example/client/diary/food?day=2026-10-17",
        data: '{"kcal":500}',
        cookies: { "sb-access-token": "x" },
        headers: { authorization: "Bearer x" },
        query_string: "day=2026-10-17",
      },
      transaction: "GET /client/trainers/0b7c3c3e-1f2a-4c55-9a7b-2d1e6f0a9b11?tab=1",
    } as ErrorEvent);
    expect(event).toEqual({
      type: undefined,
      request: { method: "POST", url: "/client/diary/food" },
      transaction: "GET /client/trainers/:id",
    });
  });
});

describe("isForeignRejection", () => {
  it("matches a wallet extension's bare { code, message } rejection", () => {
    expect(isForeignRejection({ code: 4001, message: "User rejected the request." })).toBe(true);
    expect(isForeignRejection({ code: -32603, message: "Internal error", data: {} })).toBe(true);
    expect(isForeignRejection({ code: "ACTION_REJECTED", message: "no" })).toBe(true);
  });

  it("keeps errors and any other shape", () => {
    expect(isForeignRejection(Object.assign(new Error("boom"), { code: 1 }))).toBe(false);
    expect(isForeignRejection({ message: "no code" })).toBe(false);
    expect(isForeignRejection({ code: 1 })).toBe(false);
    expect(isForeignRejection({ code: 1, message: "x", details: "", hint: "" })).toBe(false);
    expect(isForeignRejection(undefined)).toBe(false);
    expect(isForeignRejection("timeout")).toBe(false);
    class Custom {
      code = 1;
      message = "x";
    }
    expect(isForeignRejection(new Custom())).toBe(false);
  });

  it("drops such an event and keeps the rest", () => {
    const event = { type: undefined, transaction: "/trainer" } as ErrorEvent;
    expect(scrubEvent({ ...event }, { originalException: { code: 4001, message: "User rejected the request." } })).toBeNull();
    expect(scrubEvent({ ...event }, { originalException: new Error("boom") })).not.toBeNull();
    expect(scrubEvent({ ...event })).not.toBeNull();
  });
});
