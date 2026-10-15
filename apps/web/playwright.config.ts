import { defineConfig } from "@playwright/test";

/*
 * End-to-end checks of the built app (npm run build first; the server below serves .next).
 * Port 3100 keeps clear of `next dev` on 3000. Chromium only: it is what Telegram's Android and
 * Desktop clients embed, and the only browser preinstalled in CI images (PLAYWRIGHT_BROWSERS_PATH).
 */
// E2E_PORT lets parallel runs (several checkouts on one machine) use their own servers. Each run
// also takes the next port: e2e/session.spec.ts starts a server of its own there.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/*
 * `next start` checks server secrets at boot (src/instrumentation.ts) and refuses to serve without
 * them. No page in this suite reaches code that uses them, so runs without real values (CI, a
 * fresh checkout) get obvious fakes. Values already in the environment always win.
 */
const PLACEHOLDER_SERVER_ENV: Record<string, string> = {
  SUPABASE_SECRET_KEY: "e2e-placeholder",
  TELEGRAM_BOT_TOKEN: "1:e2e-placeholder",
  TELEGRAM_LOGIN_CLIENT_ID: "e2e-placeholder",
  TELEGRAM_LOGIN_CLIENT_SECRET: "e2e-placeholder",
};
const serverEnv = Object.fromEntries(Object.entries(PLACEHOLDER_SERVER_ENV).map(([name, value]) => [name, process.env[name] || value]));

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    // Russian is the product's default; tests that need English set their own locale or cookie.
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    env: serverEnv,
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
});
