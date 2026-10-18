import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const next = vi.hoisted(() => ({
  refresh: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
}));
vi.mock("next/cache", () => ({ refresh: next.refresh }));
vi.mock("next/navigation", () => ({ redirect: next.redirect }));

type Write = {
  table: string;
  op: "update" | "insert";
  values: Record<string, unknown> | Record<string, unknown>[];
  filter?: [string, unknown];
  only?: [string, unknown];
};

/** Writes made as the signed-in user; `fail` makes the next write answer with an error, `rows` is what a write returns. */
const db = vi.hoisted(() => ({
  user: "trainer-1" as string | null,
  writes: [] as Write[],
  fail: false,
  rows: [{ id: "row-1" }] as { id: string }[],
}));

function result() {
  const error = db.fail ? { code: "23514", message: "check" } : null;
  return { data: error ? null : db.rows, error };
}

/** A write that can be awaited as it is or narrowed with eq/is and select first, like the client's builder. */
function written(write: Write) {
  db.writes.push(write);
  const query = {
    eq: (column: string, value: unknown) => {
      write.filter = [column, value];
      return query;
    },
    is: (column: string, value: unknown) => {
      write.only = [column, value];
      return query;
    },
    select: () => query,
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => resolve(result()),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { default_currency: "RUB" }, error: null }) }) }),
      update: (values: Record<string, unknown>) => written({ table, op: "update", values }),
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => written({ table, op: "insert", values }),
    }),
  }),
}));

const { archiveLocation, saveLocation, saveWizardStep } = await import("./actions");

const IDLE = { status: "idle" } as const;

function form(values: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.user = "trainer-1";
  db.writes = [];
  db.fail = false;
  db.rows = [{ id: "row-1" }];
});

describe("saveWizardStep", () => {
  it("saves the name in settings and the intro in the trainer profile, then opens the next step", async () => {
    await expect(saveWizardStep(IDLE, form({ step: "profile", name: " Анна ", headline: "Силовые", bio: "" }))).rejects.toThrow(
      "redirect /onboarding/trainer/format",
    );
    expect(db.writes).toEqual([
      { table: "user_settings", op: "update", values: { display_name: "Анна" }, filter: ["user_id", "trainer-1"] },
      { table: "trainer_profiles", op: "update", values: { headline: "Силовые", bio: null }, filter: ["user_id", "trainer-1"] },
    ]);
  });

  it("asks for a name and keeps what was typed", async () => {
    const state = await saveWizardStep(IDLE, form({ step: "profile", name: "  ", headline: "Йога", bio: "" }));
    expect(state).toEqual({ status: "invalid", fields: ["name"], values: { name: "  ", headline: "Йога", bio: "" } });
    expect(db.writes).toEqual([]);
  });

  it("needs at least one format and drops unknown specialties", async () => {
    expect(await saveWizardStep(IDLE, form({ step: "format", city: "", specialties: ["yoga"] }))).toMatchObject({
      status: "invalid",
      fields: ["format"],
      values: { specialties: ["yoga"] },
    });
    await expect(
      saveWizardStep(IDLE, form({ step: "format", online: "on", city: "Казань", specialties: ["yoga", "yoga", "<script>"] })),
    ).rejects.toThrow("redirect /onboarding/trainer/locations");
    expect(db.writes.at(-1)?.values).toEqual({ works_offline: false, works_online: true, city: "Казань", specialties: ["yoga"] });
  });

  it("adds a place for the trainer and stays for another with Добавить ещё", async () => {
    const state = await saveWizardStep(IDLE, form({ step: "locations", intent: "more", name: "Зал на Ленина", address: "" }));
    expect(state).toEqual({ status: "added" });
    expect(next.refresh).toHaveBeenCalledOnce();
    expect(db.writes).toEqual([{ table: "locations", op: "insert", values: { trainer_id: "trainer-1", name: "Зал на Ленина", address: null } }]);
  });

  it("moves on without writing when an optional step is left empty", async () => {
    await expect(saveWizardStep(IDLE, form({ step: "locations", name: "", address: "" }))).rejects.toThrow("redirect /onboarding/trainer/region");
    await expect(saveWizardStep(IDLE, form({ step: "payment", title: "", url: "", kind: "sbp" }))).rejects.toThrow(
      "redirect /onboarding/trainer/prices",
    );
    await expect(saveWizardStep(IDLE, form({ step: "prices", dropIn: "", p5: "", p10: "", p20: "", validity: "" }))).rejects.toThrow(
      "redirect /onboarding/trainer/certificates",
    );
    expect(db.writes).toEqual([]);
  });

  it("checks the time zone and the currency", async () => {
    expect(await saveWizardStep(IDLE, form({ step: "region", timeZone: "Mars/Olympus", currency: "RUB" }))).toMatchObject({
      status: "invalid",
      fields: ["timeZone"],
    });
    await expect(saveWizardStep(IDLE, form({ step: "region", timeZone: "Asia/Almaty", currency: "KZT" }))).rejects.toThrow(
      "redirect /onboarding/trainer/cancellation",
    );
    expect(db.writes.map((write) => write.values)).toEqual([{ time_zone: "Asia/Almaty" }, { default_currency: "KZT" }]);
  });

  it("takes only the offered cancellation deadlines", async () => {
    expect(await saveWizardStep(IDLE, form({ step: "cancellation", hours: "1000" }))).toMatchObject({ status: "invalid" });
    await expect(saveWizardStep(IDLE, form({ step: "cancellation", hours: "12" }))).rejects.toThrow("redirect /onboarding/trainer/payment");
    expect(db.writes).toEqual([
      { table: "trainer_profiles", op: "update", values: { cancellation_deadline_hours: 12 }, filter: ["user_id", "trainer-1"] },
    ]);
  });

  it("accepts only https payment links", async () => {
    expect(await saveWizardStep(IDLE, form({ step: "payment", title: "СБП", url: "http://pay.example", kind: "sbp" }))).toMatchObject({
      status: "invalid",
      fields: ["url"],
    });
    expect(await saveWizardStep(IDLE, form({ step: "payment", title: "СБП", url: "javascript:alert(1)", kind: "sbp" }))).toMatchObject({
      status: "invalid",
      fields: ["url"],
    });
    await expect(
      saveWizardStep(IDLE, form({ step: "payment", title: "СБП", url: "https://pay.example/anna", kind: "self_employed" })),
    ).rejects.toThrow("redirect /onboarding/trainer/prices");
    expect(db.writes.at(-1)).toEqual({
      table: "payment_links",
      op: "insert",
      values: { trainer_id: "trainer-1", title: "СБП", url: "https://pay.example/anna", kind: "self_employed" },
    });
  });

  it("creates the price grid from the template in the trainer's currency", async () => {
    await expect(
      saveWizardStep(IDLE, form({ step: "prices", dropIn: "2 000", p5: "9000", p10: "16000", p20: "", validity: "90" })),
    ).rejects.toThrow("redirect /onboarding/trainer/certificates");
    expect(db.writes).toEqual([
      {
        table: "packages",
        op: "insert",
        values: [
          { trainer_id: "trainer-1", title: "Разовое занятие", sessions_count: 1, price_minor: 200000, currency: "RUB", sort_order: 0 },
          { trainer_id: "trainer-1", title: "5 занятий", sessions_count: 5, price_minor: 900000, currency: "RUB", validity_days: 90, sort_order: 1 },
          { trainer_id: "trainer-1", title: "10 занятий", sessions_count: 10, price_minor: 1600000, currency: "RUB", validity_days: 90, sort_order: 2 },
        ],
      },
    ]);
  });

  it("checks the template prices and skips a grid the trainer already has", async () => {
    expect(await saveWizardStep(IDLE, form({ step: "prices", dropIn: "abc", p5: "-1", p10: "", p20: "", validity: "7" }))).toMatchObject({
      status: "invalid",
      fields: ["dropIn", "p5", "validity"],
    });
    await expect(saveWizardStep(IDLE, form({ step: "prices", existing: "1" }))).rejects.toThrow("redirect /onboarding/trainer/certificates");
    expect(db.writes).toEqual([]);
  });

  it("finishes on Позже without writing anything", async () => {
    await expect(saveWizardStep(IDLE, form({ step: "certificates" }))).rejects.toThrow("redirect /onboarding/trainer/done");
    expect(db.writes).toEqual([]);
  });

  it("reports a write the database refused and keeps the form", async () => {
    db.fail = true;
    expect(await saveWizardStep(IDLE, form({ step: "cancellation", hours: "24" }))).toEqual({ status: "failed", values: { hours: "24" } });
  });

  it("sends a signed-out request back to the invite screen", async () => {
    db.user = null;
    await expect(saveWizardStep(IDLE, form({ step: "profile", name: "Анна" }))).rejects.toThrow("redirect /onboarding/trainer");
    expect(db.writes).toEqual([]);
  });

  it("refuses an unknown step", async () => {
    expect(await saveWizardStep(IDLE, form({ step: "price-grid" }))).toEqual({ status: "failed", values: {} });
  });
});

describe("editing the profile after the wizard", () => {
  it("goes back to the trainer profile after saving a section", async () => {
    await expect(saveWizardStep(IDLE, form({ step: "cancellation", mode: "edit", hours: "12" }))).rejects.toThrow("redirect /trainer/profile");
    expect(db.writes).toEqual([
      { table: "trainer_profiles", op: "update", values: { cancellation_deadline_hours: 12 }, filter: ["user_id", "trainer-1"] },
    ]);
  });

  it("keeps the wizard order for steps the profile screen doesn't edit", async () => {
    await expect(saveWizardStep(IDLE, form({ step: "payment", mode: "edit", title: "", url: "" }))).rejects.toThrow(
      "redirect /onboarding/trainer/prices",
    );
  });

  it("does not pass the mode back to the form as a field", async () => {
    const state = await saveWizardStep(IDLE, form({ step: "profile", mode: "edit", name: "", headline: "", bio: "" }));
    expect(state).toEqual({ status: "invalid", fields: ["name"], values: { name: "", headline: "", bio: "" } });
  });
});

describe("saveLocation", () => {
  const ID = "6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e";

  it("adds a new place for the signed-in trainer", async () => {
    expect(await saveLocation({ status: "idle" }, form({ name: " Зал на Ленина ", address: "" }))).toEqual({ status: "saved" });
    expect(db.writes).toEqual([{ table: "locations", op: "insert", values: { trainer_id: "trainer-1", name: "Зал на Ленина", address: null } }]);
    expect(next.refresh).toHaveBeenCalled();
  });

  it("changes a place that is still in use", async () => {
    expect(await saveLocation({ status: "idle" }, form({ id: ID, name: "Студия", address: "Невский, 1" }))).toEqual({ status: "saved" });
    expect(db.writes).toEqual([
      { table: "locations", op: "update", values: { name: "Студия", address: "Невский, 1" }, filter: ["id", ID], only: ["archived_at", null] },
    ]);
  });

  it("asks for a name and keeps what was typed", async () => {
    expect(await saveLocation({ status: "idle" }, form({ id: ID, name: " ", address: "Невский, 1" }))).toEqual({
      status: "invalid",
      fields: ["name"],
      values: { name: " ", address: "Невский, 1" },
    });
    expect(db.writes).toEqual([]);
  });

  it("refuses an id that is not a uuid, a signed-out user and a place it could not change", async () => {
    const values = { name: "Студия", address: "" };
    expect(await saveLocation({ status: "idle" }, form({ id: "nope", ...values }))).toEqual({ status: "failed", values });
    db.user = null;
    expect(await saveLocation({ status: "idle" }, form(values))).toEqual({ status: "failed", values });
    db.user = "trainer-1";
    db.rows = [];
    expect(await saveLocation({ status: "idle" }, form({ id: ID, ...values }))).toEqual({ status: "failed", values });
  });
});

describe("archiveLocation", () => {
  it("archives the place instead of deleting it", async () => {
    expect(await archiveLocation("6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e")).toEqual({ failed: false });
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({ table: "locations", op: "update", filter: ["id", "6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e"], only: ["archived_at", null] });
    expect(typeof (db.writes[0].values as Record<string, unknown>).archived_at).toBe("string");
  });

  it("fails on a bad id or when nothing was archived", async () => {
    expect(await archiveLocation("nope")).toEqual({ failed: true });
    db.rows = [];
    expect(await archiveLocation("6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e")).toEqual({ failed: true });
  });
});
