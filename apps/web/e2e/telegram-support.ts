import { expect, type Page } from "@playwright/test";

/*
 * A stand-in for Telegram's mobile client, enough to run the Mini App in Playwright. tma.js posts
 * events to window.TelegramWebviewProxy when it is there (as on Android and iOS), and Telegram talks
 * back through window.Telegram.WebView.receiveEvent. Launch params come in the URL hash.
 */

export type TelegramEvent = [type: string, data: Record<string, unknown> | undefined];

type TelegramWindow = Window & {
  __tg?: TelegramEvent[];
  TelegramWebviewProxy?: { postEvent: (type: string, data?: string) => void };
  Telegram?: { WebView?: { receiveEvent?: (type: string, data?: unknown) => void } };
};

/** Telegram's own palettes. Only bg_color decides the scheme, the rest makes the params realistic. */
export const TELEGRAM_THEMES = {
  dark: {
    bg_color: "#17212b",
    secondary_bg_color: "#232e3c",
    text_color: "#f5f5f5",
    hint_color: "#708499",
    link_color: "#6ab3f3",
    button_color: "#5288c1",
    button_text_color: "#ffffff",
    header_bg_color: "#17212b",
    bottom_bar_bg_color: "#17212b",
  },
  light: {
    bg_color: "#ffffff",
    secondary_bg_color: "#efeff3",
    text_color: "#000000",
    hint_color: "#999999",
    link_color: "#2481cc",
    button_color: "#2481cc",
    button_text_color: "#ffffff",
    header_bg_color: "#ffffff",
    bottom_bar_bg_color: "#ffffff",
  },
} as const;

export type TelegramTheme = keyof typeof TELEGRAM_THEMES;

type LaunchOptions = {
  theme?: TelegramTheme;
  /** Leave `signature` out of initData, as old clients do: tma.js 3 then rejects the launch params. */
  unsigned?: boolean;
};

/**
 * The launch params Telegram appends to the Mini App URL, shaped to pass tma.js's schema. The hash
 * and signature are fake: the sign-in endpoint is stubbed, so nothing checks them.
 */
export function launchHash({ theme = "dark", unsigned = false }: LaunchOptions = {}): string {
  const initData = new URLSearchParams({
    user: JSON.stringify({ id: 42, first_name: "Sam", username: "sam", language_code: "ru", allows_write_to_pm: true }),
    chat_instance: "-4242",
    chat_type: "sender",
    auth_date: String(Math.floor(Date.now() / 1000)),
    ...(unsigned ? {} : { signature: "e2e-signature" }),
    hash: "0".repeat(64),
  });
  const params = new URLSearchParams({
    tgWebAppData: initData.toString(),
    tgWebAppVersion: "9.0",
    tgWebAppPlatform: "android",
    tgWebAppThemeParams: JSON.stringify(TELEGRAM_THEMES[theme]),
  });
  return `#${params}`;
}

export type SignInAnswer = { status: number; body: Record<string, unknown> };

/**
 * Opens `path` as the Mini App. Every event the app posts to Telegram lands in window.__tg; the
 * sign-in endpoint answers `signIn` (an existing session by default). Returns the sign-in requests.
 */
export async function openInTelegram(
  page: Page,
  path: string,
  { signIn = { status: 200, body: { ok: true, fresh: false } }, ...launch }: LaunchOptions & { signIn?: SignInAnswer } = {},
) {
  await page.addInitScript(() => {
    const w = window as TelegramWindow;
    w.TelegramWebviewProxy = {
      postEvent(type, data) {
        (w.__tg ||= []).push([type, data ? JSON.parse(data) : undefined]);
      },
    };
  });
  const signIns: string[] = [];
  await page.route("**/api/auth/telegram/mini-app", async (route) => {
    signIns.push(route.request().postData() ?? "");
    await route.fulfill({ status: signIn.status, json: signIn.body });
  });
  await page.goto(path + launchHash(launch));
  return signIns;
}

/** Every event the page posted to Telegram so far, oldest first. */
export function posted(page: Page): Promise<TelegramEvent[]> {
  return page.evaluate(() => (window as TelegramWindow).__tg ?? []);
}

/** The payload of the latest `type` event, or undefined if it was never posted. */
export async function lastPosted(page: Page, type: string) {
  return (await posted(page)).findLast(([name]) => name === type)?.[1];
}

/** The app went live as a Mini App: it told Telegram it is ready to be shown. */
export async function expectMiniAppReady(page: Page) {
  await expect.poll(async () => (await posted(page)).some(([type]) => type === "web_app_ready")).toBe(true);
}

/** Telegram's header, background and bottom bar end up in `color`. */
export async function expectChrome(page: Page, color: string) {
  for (const type of ["web_app_set_header_color", "web_app_set_background_color", "web_app_set_bottom_bar_color"]) {
    await expect.poll(() => lastPosted(page, type), { message: type }).toEqual({ color });
  }
}

/** Whether Telegram's BackButton is shown. It starts hidden, so "never set up" counts as hidden. */
export async function backButtonVisible(page: Page) {
  return (await lastPosted(page, "web_app_setup_back_button"))?.is_visible ?? false;
}

/** Whether Telegram may take vertical swipes (minimize the Mini App). On until the app says otherwise. */
export async function verticalSwipesAllowed(page: Page) {
  return (await lastPosted(page, "web_app_setup_swipe_behavior"))?.allow_vertical_swipe ?? true;
}

/** An event from Telegram to the Mini App: theme_changed, back_button_pressed, settings_button_pressed. */
export async function receive(page: Page, type: string, data?: Record<string, unknown>) {
  await page.evaluate(([type, data]) => (window as TelegramWindow).Telegram?.WebView?.receiveEvent?.(type, data), [type, data] as const);
}
