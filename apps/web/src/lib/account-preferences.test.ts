import { describe, expect, it, vi } from "vitest";
import type { Preferences } from "./preferences";

vi.mock("server-only", () => ({}));

const { deviceCookies, preferencesPatch, reconcilePreferences, saveAccountPreferencesRow, syncPreferences } =
  await import("./account-preferences");

const USER_ID = "8d0c6f6e-2f7a-4a43-9a4e-4a8f0f6b1c11";
const ACCOUNT: Preferences = {
  locale: "ru",
  theme: "system",
  lastZone: "client",
};

/** A user client stub: answers the user_settings read and records updates. */
function fakeSupabase(row: { locale: string; theme: string; last_zone: string } | null, readError: { code: string } | null = null) {
  const updates: { row: Record<string, unknown>; userId: unknown }[] = [];
  const client = {
    from: (table: string) => {
      expect(table).toBe("user_settings");
      return {
        select: (columns: string) => {
          expect(columns).toBe("locale, theme, last_zone");
          return {
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: readError }),
            }),
          };
        },
        update: (values: Record<string, unknown>) => ({
          eq: async (_column: string, userId: unknown) => {
            updates.push({ row: values, userId });
            return { error: null };
          },
        }),
      };
    },
  };
  return {
    client: client as unknown as Parameters<typeof syncPreferences>[0],
    updates,
  };
}

describe("reconcilePreferences", () => {
  it("gives a new account the device's choices and saves them", () => {
    const result = reconcilePreferences({
      account: ACCOUNT,
      device: { locale: "en", theme: "light", lastZone: "trainer" },
      newAccount: true,
      firstLocale: "ru",
    });
    expect(result).toEqual({
      save: { locale: "en", theme: "light", lastZone: "trainer" },
      cookies: {},
    });
  });

  it("gives a new account without a saved language the first language, on the device too", () => {
    const result = reconcilePreferences({
      account: ACCOUNT,
      device: {},
      newAccount: true,
      firstLocale: "en",
    });
    expect(result.save).toEqual({ locale: "en" });
    expect(result.cookies).toEqual({
      locale: "en",
      theme: "system",
      lastZone: "client",
    });
  });

  it("brings an existing account's language and theme to the device and saves nothing", () => {
    const result = reconcilePreferences({
      account: { locale: "en", theme: "dark", lastZone: "trainer" },
      device: { locale: "ru", theme: "light" },
      newAccount: false,
      firstLocale: "ru",
    });
    expect(result).toEqual({
      save: {},
      cookies: { locale: "en", theme: "dark", lastZone: "trainer" },
    });
  });

  it("keeps the zone the device was in last", () => {
    const result = reconcilePreferences({
      account: { locale: "ru", theme: "system", lastZone: "trainer" },
      device: { locale: "ru", theme: "system", lastZone: "client" },
      newAccount: false,
      firstLocale: "ru",
    });
    expect(result).toEqual({ save: {}, cookies: {} });
  });

  it("ignores cookies with junk in them", () => {
    const result = reconcilePreferences({
      account: ACCOUNT,
      device: { locale: "de", theme: "sepia", lastZone: "admin" },
      newAccount: true,
      firstLocale: "en",
    });
    expect(result.save).toEqual({ locale: "en" });
    expect(result.cookies).toEqual({
      locale: "en",
      theme: "system",
      lastZone: "client",
    });
  });
});

describe("syncPreferences", () => {
  it("saves a new account's choices and returns the cookies to set", async () => {
    const { client, updates } = fakeSupabase({
      locale: "ru",
      theme: "system",
      last_zone: "client",
    });
    const cookies = await syncPreferences(client, {
      userId: USER_ID,
      device: { theme: "dark" },
      newAccount: true,
      firstLocale: "en",
    });
    expect(updates).toEqual([{ row: { locale: "en", theme: "dark" }, userId: USER_ID }]);
    expect(cookies).toEqual({ locale: "en", lastZone: "client" });
  });

  it("falls back to a first language when the account can't be read", async () => {
    const { client, updates } = fakeSupabase(null, { code: "PGRST000" });
    await expect(
      syncPreferences(client, {
        userId: USER_ID,
        device: {},
        newAccount: false,
        firstLocale: "en",
      }),
    ).resolves.toEqual({
      locale: "en",
    });
    await expect(
      syncPreferences(client, {
        userId: USER_ID,
        device: { locale: "ru" },
        newAccount: false,
        firstLocale: "en",
      }),
    ).resolves.toEqual({});
    expect(updates).toEqual([]);
  });
});

describe("saveAccountPreferencesRow", () => {
  it("maps preferences to user_settings columns", async () => {
    const { client, updates } = fakeSupabase(null);
    await saveAccountPreferencesRow(client, USER_ID, {
      lastZone: "trainer",
      theme: "light",
    });
    expect(updates).toEqual([{ row: { last_zone: "trainer", theme: "light" }, userId: USER_ID }]);
  });
});

describe("preferencesPatch", () => {
  it("takes known preferences only", () => {
    expect(preferencesPatch.safeParse({ locale: "en" }).success).toBe(true);
    expect(preferencesPatch.safeParse({ theme: "dark", lastZone: "trainer" }).success).toBe(true);
    expect(preferencesPatch.safeParse({}).success).toBe(false);
    expect(preferencesPatch.safeParse({ locale: "de" }).success).toBe(false);
    expect(preferencesPatch.safeParse({ locale: "en", time_zone: "UTC" }).success).toBe(false);
  });
});

describe("deviceCookies", () => {
  it("reads the three preference cookies", () => {
    const jar: Record<string, string> = {
      "dafit-locale": "en",
      "dafit-theme": "light",
      "dafit-zone": "trainer",
    };
    expect(deviceCookies((name) => jar[name])).toEqual({
      locale: "en",
      theme: "light",
      lastZone: "trainer",
    });
  });
});
