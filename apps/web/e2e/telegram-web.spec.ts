import { expect, test, type Page } from "@playwright/test";
import { cookieAttributesString } from "../src/lib/cookie-attributes";
import { isPhone } from "./support";
import { startTelegramWeb } from "./telegram-support";

/*
 * Telegram Web runs the Mini App in an iframe on web.telegram.org, so there the app is a third party.
 * Browsers drop SameSite=Lax cookies in such an iframe; the app's cookies are SameSite=None, Secure
 * and Partitioned in production (lib/cookie-attributes.ts). The stand-in (telegram-support.ts) lets
 * the browser handle every cookie itself. Without kept cookies the server sends the language on every
 * sign-in, and the app used to reload for it in a loop.
 */

// Both tests use the same port for the stand-in.
test.describe.configure({ mode: "serial" });

test.beforeEach(({}, testInfo) => {
  test.skip(isPhone(testInfo), "Telegram Web is a desktop client; one project is enough.");
});

/** Document loads of the app inside the iframe. */
function countAppLoads(page: Page, app: string) {
  const loads: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.url().startsWith(app)) loads.push(request.url());
  });
  return loads;
}

/** Long enough for another reload and sign-in to show up, if the app were to loop. */
const settleTime = (page: Page) => page.waitForTimeout(2000);

async function telegramWeb(baseURL: string | undefined, cookieAttributes: string) {
  const upstream = baseURL ?? "http://localhost:3100";
  // The suite's server is on E2E_PORT and session.spec.ts takes the next port: this one is the one after.
  return startTelegramWeb({ port: Number(new URL(upstream).port) + 2, upstream, cookieAttributes, locale: "en" });
}

test("keeps the app's cookies in the iframe and reloads once for Telegram's language", async ({ page, context, baseURL }) => {
  const telegram = await telegramWeb(baseURL, cookieAttributesString(true));
  try {
    const loads = countAppLoads(page, telegram.app);
    await page.goto(telegram.hostUrl("/client"));
    const app = page.frameLocator("iframe");

    // Russian browser, English Telegram: one reload shows the app in English.
    await expect(app.locator("html")).toHaveAttribute("lang", "en");
    await expect(app.getByRole("heading", { level: 1, name: "Home" }).first()).toBeVisible();
    await settleTime(page);
    expect(loads).toHaveLength(2);
    expect(telegram.signIns).toHaveLength(2);

    // The proxy's dafit-zone comes from the app's own server.
    const cookies = await context.cookies(telegram.app);
    for (const name of ["dafit-zone", "dafit-locale", "e2e-session"]) {
      const cookie = cookies.find((candidate) => candidate.name === name);
      expect(cookie, name).toMatchObject({ sameSite: "None", secure: true });
      expect(cookie?.partitionKey, name).toBeTruthy();
    }
  } finally {
    await telegram.close();
  }
});

test("with cookies the browser drops, /login asks for the Telegram app and nothing reloads", async ({ page, baseURL }) => {
  // SameSite=Lax, as the app's cookies were: the browser keeps none of them in the iframe.
  const telegram = await telegramWeb(baseURL, cookieAttributesString(false));
  try {
    const loads = countAppLoads(page, telegram.app);
    await page.goto(telegram.hostUrl("/login?next=%2Fclient"));
    const app = page.frameLocator("iframe");

    await expect(app.getByText("Браузер не даёт сохранить вход. Открой DaFit в приложении Telegram на телефоне или компьютере.")).toBeVisible();
    await expect(app.getByRole("button", { name: "Войти через Telegram" })).toHaveCount(0);
    await expect(app.locator('a[href^="/auth/telegram/login"]')).toBeHidden();
    await settleTime(page);
    expect(loads).toHaveLength(1);
    expect(telegram.signIns).toHaveLength(1);
  } finally {
    await telegram.close();
  }
});
