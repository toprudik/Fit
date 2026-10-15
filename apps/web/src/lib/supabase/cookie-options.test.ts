import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionCookieOptions } from "./cookie-options";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessionCookieOptions", () => {
  it("keep the session out of the page's reach, for the whole site", () => {
    expect(sessionCookieOptions).toMatchObject({ httpOnly: true, path: "/" });
  });

  it("are SameSite=None, Secure and Partitioned in production, so Telegram Web's iframe keeps the session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { sessionCookieOptions: production } = await import("./cookie-options");
    expect(production).toEqual({ httpOnly: true, path: "/", sameSite: "none", secure: true, partitioned: true });
  });

  it("stay Lax over plain http in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { sessionCookieOptions: development } = await import("./cookie-options");
    expect(development).toEqual({ httpOnly: true, path: "/", sameSite: "lax", secure: false });
  });
});
