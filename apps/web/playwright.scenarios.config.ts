import { defineConfig } from "@playwright/test";

/*
 * Signed-in user scenarios against a local Supabase (e2e-scenarios/). Run them with
 * scripts/e2e-scenarios.sh: it reads the local keys from `supabase status`, builds the app for that
 * database and starts this suite. The plain suite (playwright.config.ts) needs no database and stays
 * the PR check; this one is heavier and runs on demand.
 */
const PORT = Number(process.env.E2E_SCENARIOS_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;

/** Server secrets of the local stack. The bot token is made up: the suite signs initData with the same one. */
const serverEnv: Record<string, string> = {
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY ?? "",
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? "1:e2e-scenarios",
  TELEGRAM_LOGIN_CLIENT_ID: "e2e-placeholder",
  TELEGRAM_LOGIN_CLIENT_SECRET: "e2e-placeholder",
};

export default defineConfig({
  testDir: "e2e-scenarios",
  outputDir: "test-results/scenarios",
  globalSetup: "./e2e-scenarios/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    // Visual snapshots: a few pixels of font hinting differ between machines, a layout change does not.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
  },
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/scenarios" }]] : [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
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
