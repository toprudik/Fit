import { describe, expect, it } from "vitest";
import { cardMatchesPerson, displayName, filterClients, matchesSearch, parseClientFilter, passIsEnding, type ClientItem } from "./clients";

const base: ClientItem = {
  coachingId: "p",
  name: "Анна Смирнова",
  photoUrl: null,
  isCard: false,
  status: "active",
  archived: false,
  startedAt: "2026-03-03T10:00:00Z",
  attended: 0,
  nextSessionAt: null,
  availableSessions: 0,
  debtSessions: 0,
  hasPass: false,
  passEnding: false,
  parqFlagged: false,
};

const items: ClientItem[] = [
  { ...base, coachingId: "plain" },
  { ...base, coachingId: "debt", name: "Игорь Ким", debtSessions: 2, hasPass: true },
  { ...base, coachingId: "ending", name: "Алёна Петрова", hasPass: true, passEnding: true },
  { ...base, coachingId: "archived", archived: true },
  { ...base, coachingId: "ended", status: "ended" },
  { ...base, coachingId: "trial", name: "Олег", status: "trial", hasPass: true },
];

const ids = (list: ClientItem[]) => list.map((item) => item.coachingId);

describe("client filters", () => {
  it("lists every live client outside the archive under All", () => {
    expect(ids(filterClients(items, "all", ""))).toEqual(["plain", "debt", "ending", "trial"]);
  });

  it("narrows to debt, an ending pass or no pass", () => {
    expect(ids(filterClients(items, "debt", ""))).toEqual(["debt"]);
    expect(ids(filterClients(items, "ending", ""))).toEqual(["ending"]);
    expect(ids(filterClients(items, "noPass", ""))).toEqual(["plain"]);
  });

  it("keeps archived and ended pairs in the archive only (PAIR-6)", () => {
    expect(ids(filterClients(items, "archive", ""))).toEqual(["archived", "ended"]);
  });

  it("reads an unknown filter as All", () => {
    expect(parseClientFilter("debt")).toBe("debt");
    expect(parseClientFilter("nope")).toBe("all");
    expect(parseClientFilter(undefined)).toBe("all");
  });
});

describe("client search", () => {
  it("matches every word in any order, ignoring case and ё", () => {
    expect(matchesSearch("Алёна Петрова", "петрова алена")).toBe(true);
    expect(matchesSearch("Алёна Петрова", "  АЛЁ ")).toBe(true);
    expect(matchesSearch("Алёна Петрова", "Анна")).toBe(false);
    expect(matchesSearch("Алёна Петрова", "")).toBe(true);
  });

  it("searches within the filter", () => {
    expect(ids(filterClients(items, "all", "ким"))).toEqual(["debt"]);
    expect(ids(filterClients(items, "debt", "анна"))).toEqual([]);
  });
});

describe("passIsEnding", () => {
  const now = new Date("2026-10-16T12:00:00Z");

  it("is ending at one session left or within a week of the end", () => {
    expect(passIsEnding([{ status: "active", available: 1, effective_expires_at: null }], now)).toBe(true);
    expect(passIsEnding([{ status: "active", available: 5, effective_expires_at: "2026-10-20T00:00:00Z" }], now)).toBe(true);
    expect(passIsEnding([{ status: "active", available: 5, effective_expires_at: "2026-11-30T00:00:00Z" }], now)).toBe(false);
  });

  it("ignores a frozen pass", () => {
    expect(passIsEnding([{ status: "frozen", available: 0, effective_expires_at: null }], now)).toBe(false);
  });
});

describe("displayName", () => {
  it("prefers the trainer's alias, then the person's own name, then the username", () => {
    expect(displayName({ first_name: "Anna", last_name: "Smith" }, "Anna from the morning")).toBe("Anna from the morning");
    expect(displayName({ display_name: "Аня", first_name: "Anna" })).toBe("Аня");
    expect(displayName({ first_name: " Anna ", last_name: null })).toBe("Anna");
    expect(displayName({ first_name: null, username: "anna" })).toBe("@anna");
    expect(displayName(undefined)).toBe("");
  });
});

describe("cardMatchesPerson", () => {
  it("matches by the first three letters of any word", () => {
    expect(cardMatchesPerson("Катя", { first_name: "Катерина" })).toBe(true);
    expect(cardMatchesPerson("Саша Петров", { first_name: "Александр", last_name: "Петров" })).toBe(true);
    expect(cardMatchesPerson("алёна", { first_name: "Алена" })).toBe(true);
  });

  it("does not match different names or empty ones", () => {
    expect(cardMatchesPerson("Борис", { first_name: "Анна" })).toBe(false);
    expect(cardMatchesPerson("", { first_name: "Анна" })).toBe(false);
    expect(cardMatchesPerson("Анна", {})).toBe(false);
  });
});
