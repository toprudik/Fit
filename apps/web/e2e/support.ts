import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export type Locale = "ru" | "en";
export type Zone = "trainer" | "client";
export type Scheme = "dark" | "light";

export const SCHEMES: readonly Scheme[] = ["dark", "light"];

/** WCAG 2.2 AA (docs/prd/quality.md): every rule axe tags for levels A and AA up to 2.2. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Tab labels and links per zone, written out here so the test does not trust the code it checks. */
export const TABS: Record<Locale, Record<Zone, readonly (readonly [label: string, href: string])[]>> = {
  ru: {
    trainer: [
      ["Сегодня", "/trainer"],
      ["Расписание", "/trainer/schedule"],
      ["Клиенты", "/trainer/clients"],
      ["Деньги", "/trainer/money"],
      ["Ещё", "/trainer/more"],
    ],
    client: [
      ["Главная", "/client"],
      ["Занятия", "/client/sessions"],
      ["Дневник", "/client/diary"],
      ["Прогресс", "/client/progress"],
      ["Тренеры", "/client/trainers"],
    ],
  },
  en: {
    trainer: [
      ["Today", "/trainer"],
      ["Schedule", "/trainer/schedule"],
      ["Clients", "/trainer/clients"],
      ["Money", "/trainer/money"],
      ["More", "/trainer/more"],
    ],
    client: [
      ["Home", "/client"],
      ["Sessions", "/client/sessions"],
      ["Diary", "/client/diary"],
      ["Progress", "/client/progress"],
      ["Trainers", "/client/trainers"],
    ],
  },
};

/** Accessible name of the tab bar and of the side menu's navigation. */
export const NAV_LABEL: Record<Locale, string> = { ru: "Разделы", en: "Sections" };

export const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

/** Full-page screenshots for design review land in e2e/screenshots (git-ignored). */
export function screenshotPath(testInfo: TestInfo, scheme: Scheme, slug: string) {
  return join(testInfo.project.testDir, "screenshots", `${testInfo.project.name}-${scheme}-${slug}.png`);
}

/**
 * Waits until the page looks final: web fonts loaded and every finite animation (screen and tab
 * transitions, sheet entry) finished. Endless ones, like the skeleton shimmer, are left running.
 */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
    const finished = Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    // A paused animation never finishes; don't let it hang the test.
    await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 3000))]);
  });
}

/**
 * The element ends up fully opaque, whichever ancestor carries the fade: a transition that never
 * finishes (or never starts, as can happen with reduced motion) would leave it invisible to users.
 */
export async function expectOpaque(locator: Locator) {
  const opacity = () =>
    locator.evaluate((element) => {
      let value = 1;
      for (let node: Element | null = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
      return value;
    });
  await expect.poll(opacity).toBe(1);
}

/** Fails with one readable line per violation: rule, impact, what to fix and where. */
export async function expectAccessible(page: Page) {
  // After a navigation or a server action the streamed metadata may put <title> back a moment later;
  // a page that never gets one still fails on document-title below.
  await page.waitForFunction(() => document.title !== "", undefined, { timeout: 5_000 }).catch(() => undefined);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const report = violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help} at ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
  expect(report).toEqual([]);
}

/**
 * Collects uncaught exceptions and console errors (React reports hydration mismatches there).
 * `allow` filters expected noise, such as the browser logging a 404 for the not-found page itself.
 */
export function collectErrors(page: Page, allow: RegExp[] = []) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !allow.some((pattern) => pattern.test(message.text()))) errors.push(`console: ${message.text()}`);
  });
  return () => errors;
}

/**
 * The zone's tabs as the user sees them: the bottom tab bar on a phone, the side menu on a
 * desktop. Exactly one is the current page.
 */
export async function expectTabs(page: Page, testInfo: TestInfo, locale: Locale, zone: Zone, active: string) {
  const tabs = TABS[locale][zone];
  if (isPhone(testInfo)) {
    const tabBar = page.getByRole("navigation", { name: NAV_LABEL[locale], exact: true });
    await expect(tabBar).toBeVisible();
    await expect(tabBar.getByRole("link")).toHaveText(tabs.map(([label]) => label));
    for (const [label, href] of tabs) await expect(tabBar.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
    await expect(tabBar.locator('[aria-current="page"]')).toHaveCount(1);
  } else {
    for (const [label, href] of tabs) {
      const link = page.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  }
  // Hidden copies (the tab bar on desktop, the side menu on a phone) do not count.
  const current = page.locator('a[aria-current="page"]:visible');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAccessibleName(active);
}

/** A Web Animation started on the page: motion/react runs its fades and slides on WAAPI. */
export type RecordedAnimation = {
  /** The shell's screen wrapper (the only child of <main>), where push, pop and tab transitions play. */
  screen: boolean;
  duration: number;
  keyframes: { opacity?: string; transform?: string }[];
};

type RecordingWindow = Window & { __animations?: RecordedAnimation[] };

/** From the next page load on, records every animation the page starts, so short ones can't be missed. */
export async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    const recording = window as RecordingWindow;
    recording.__animations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
      const animation = animate.apply(this, args);
      const timing = animation.effect?.getTiming();
      recording.__animations?.push({
        screen: this.parentElement?.id === "main",
        duration: typeof timing?.duration === "number" ? timing.duration : 0,
        keyframes: (animation.effect as KeyframeEffect | null)?.getKeyframes().map(({ opacity, transform }) => ({
          opacity: opacity === undefined ? undefined : String(opacity),
          transform: transform === undefined ? undefined : String(transform),
        })) ?? [],
      });
      return animation;
    };
  });
}

/** The animations recorded since the last call (see recordAnimations). */
export async function takeAnimations(page: Page): Promise<RecordedAnimation[]> {
  return page.evaluate(() => (window as RecordingWindow).__animations?.splice(0) ?? []);
}

/**
 * Where the screen started its slide, in percent of its width: positive from the right (push),
 * negative from the left (pop), null when it did not move.
 */
export function screenSlideStart(animations: readonly RecordedAnimation[]): number | null {
  for (const animation of animations) {
    const match = animation.screen ? /translateX\((-?[\d.]+)%\)/.exec(animation.keyframes[0]?.transform ?? "") : null;
    if (match) return Number(match[1]);
  }
  return null;
}

/**
 * Nothing of a closed sheet is left over the screen: no dialog, no scroll lock, and the page is not
 * hidden from assistive technology.
 */
export async function expectNoSheetLeft(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-slot=sheet-scrim]")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  const main = page.locator("main#main");
  await expect(main).toBeVisible();
  expect(await main.evaluate((element) => element.closest('[aria-hidden="true"]') === null)).toBe(true);
}
