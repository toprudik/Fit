/** Telegram clients on phones and tablets (tgWebAppPlatform); every other one runs on a computer or in a browser. */
const MOBILE_PLATFORMS = new Set(["ios", "android", "android_x"]);

/**
 * How the Mini App takes the screen: fullscreen on a phone, the full height of Telegram's window
 * (expand) on a computer, where fullscreen would cover the whole desktop.
 */
export function displayModeFor(platform: string | undefined): "fullscreen" | "expanded" {
  return platform && MOBILE_PLATFORMS.has(platform) ? "fullscreen" : "expanded";
}
