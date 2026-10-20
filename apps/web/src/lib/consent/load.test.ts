import { beforeEach, describe, expect, it, vi } from "vitest";
import { BETA_TERMS_VERSION } from "./beta-terms";
import { LEGAL_VERSION } from "./required";

vi.mock("server-only", () => ({}));

type Row = { kind: string; version: string; accepted_at: string };

const db = vi.hoisted(() => ({
  user: "user-1" as string | null,
  rows: [] as Row[],
  timeZone: null as string | null,
  published: [] as { scope: string; accepted_at: string }[],
  trainer: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => ({ data: db.user ? { claims: { sub: db.user } } : null }) },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        is: async () => ({ data: table === "public_data_consents" ? [...db.published] : [...db.rows], error: null }),
        maybeSingle: async () => {
          if (table === "trainer_profiles") return { data: db.trainer ? { user_id: db.user } : null, error: null };
          return { data: table === "user_settings" && db.timeZone ? { time_zone: db.timeZone } : null, error: null };
        },
      };
      return chain;
    },
  }),
}));

const { loadMyConsents } = await import("./load");

const at = (day: number) => `2026-11-0${day}T10:00:00+00:00`;
const TERMS: Row[] = [
  { kind: "beta_terms", version: BETA_TERMS_VERSION, accepted_at: at(1) },
  { kind: "terms", version: LEGAL_VERSION, accepted_at: at(2) },
  { kind: "privacy_policy", version: LEGAL_VERSION, accepted_at: at(2) },
  { kind: "age_confirmed", version: LEGAL_VERSION, accepted_at: at(2) },
];

beforeEach(() => {
  db.user = "user-1";
  db.rows = [];
  db.timeZone = null;
  db.published = [];
  db.trainer = false;
});

describe("loadMyConsents", () => {
  it("is null for a signed-out visitor", async () => {
    db.user = null;
    expect(await loadMyConsents()).toBeNull();
  });

  it("dates the terms by their latest part and leaves the health data consent not given", async () => {
    db.rows = [...TERMS, { kind: "pd_general", version: LEGAL_VERSION, accepted_at: at(3) }];
    db.timeZone = "Asia/Yerevan";
    expect(await loadMyConsents()).toEqual({
      terms: { acceptedAt: at(2) },
      personal: { acceptedAt: at(3) },
      health: { acceptedAt: null },
      showcase: null,
      story: { acceptedAt: null },
      timeZone: "Asia/Yerevan",
    });
  });

  it("shows the showcase consent only to a trainer and dates both consents to publish", async () => {
    db.published = [{ scope: "story", accepted_at: at(5) }];
    expect((await loadMyConsents())?.showcase).toBeNull();
    db.trainer = true;
    db.published = [
      { scope: "showcase", accepted_at: at(6) },
      { scope: "story", accepted_at: at(5) },
    ];
    const consents = await loadMyConsents();
    expect(consents?.showcase).toEqual({ acceptedAt: at(6) });
    expect(consents?.story).toEqual({ acceptedAt: at(5) });
  });

  it("leaves a trainer's showcase consent not given until they turn the showcase on", async () => {
    db.trainer = true;
    expect((await loadMyConsents())?.showcase).toEqual({ acceptedAt: null });
  });

  it("counts the terms as not given while a part is missing or of an older edition", async () => {
    db.rows = [TERMS[0], TERMS[1], { ...TERMS[2], version: "2025-01" }, TERMS[3], { kind: "pd_health", version: LEGAL_VERSION, accepted_at: at(4) }];
    const consents = await loadMyConsents();
    expect(consents?.terms.acceptedAt).toBeNull();
    expect(consents?.health.acceptedAt).toBe(at(4));
    expect(consents?.timeZone).toBe("Europe/Moscow");
  });
});
