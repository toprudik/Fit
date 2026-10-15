import { spawn } from "node:child_process";
import { expect, test } from "@playwright/test";
import { isPhone } from "./support";

/*
 * Pages opened with a session cookie. The suite's shared server keeps its output to itself, and the
 * errors this guards against show up only there, so the test starts its own `next start` (on the
 * port after the suite's) and reads what it prints.
 */

/** The Supabase project the app was built for; the session cookie is named after it. */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://zxwabddqqtitybtsdeqp.supabase.co";
const SESSION_COOKIE = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

const b64url = (value: string) => Buffer.from(value).toString("base64url");

/**
 * A session in @supabase/ssr's cookie format. It is valid for another year by its expires_at, so
 * supabase-js reads it without a refresh, but the access token itself expired long ago, so
 * getClaims() rejects it before any network call. The page renders signed out, after running the
 * same session code as for a real user.
 */
function fakeSession(): string {
  const userId = "00000000-0000-4000-8000-000000000042";
  const jwt = [b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64url(JSON.stringify({ sub: userId, exp: 1 })), "e2e"].join(".");
  const expiresAt = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  const session = {
    access_token: jwt,
    refresh_token: "e2e-refresh-token",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  return `base64-${b64url(JSON.stringify(session))}`;
}

/** `next start` on `port`, with everything it prints collected. */
async function startServer(port: number, env: Record<string, string>) {
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port)], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const ready = new Promise<void>((resolve, reject) => {
    const collect = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes("Ready")) resolve();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    void exited.then(() => reject(new Error(`next start exited before it was ready:\n${output}`)));
  });
  await ready;
  return {
    url: `http://localhost:${port}`,
    /** Stops the server and returns everything it printed. */
    async stop() {
      child.kill();
      await exited;
      return output;
    },
  };
}

test("signed-in page loads leave no render errors on the server", async ({ browser }, testInfo) => {
  test.skip(isPhone(testInfo), "A server-side check: running it in the desktop project is enough.");
  const suitePort = Number(new URL(String(testInfo.project.use.baseURL)).port);
  const server = await startServer(suitePort + 1, testInfo.config.webServer?.env ?? {});

  let output: string;
  try {
    const context = await browser.newContext({ baseURL: server.url, locale: "ru-RU", timezoneId: "Europe/Moscow" });
    await context.addCookies([{ name: SESSION_COOKIE, value: fakeSession(), url: server.url }]);
    const page = await context.newPage();
    // A document load renders the root layout, account included, and prefetches the tabs' shells.
    for (const [path, title] of [
      ["/trainer", "Сегодня"],
      ["/profile", "Профиль"],
    ]) {
      const response = await page.goto(path, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title, exact: true }).first()).toBeVisible();
    }
    await context.close();
  } finally {
    output = await server.stop();
  }

  // Next logs a render it had to abort (e.g. Date.now() read while prerendering the shell) as an Error.
  expect(output.split("\n").filter((line) => line.includes("Error"))).toEqual([]);
});
