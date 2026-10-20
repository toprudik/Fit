import { collectErrors, expectAccessible, SCHEMES, settle } from "../e2e/support";
import { expect, test } from "./support/fixtures";
import type { Persona } from "./support/personas";
import { buildScene, type Scene } from "./support/scene";

/*
 * Every signed-in screen of each role, with a populated scene, in both themes: it answers 200, logs
 * no errors, passes axe, does not scroll sideways, does not cut the header and shows no raw strings
 * (dictionary keys, {placeholders}, "undefined", "NaN", "null"). One test per route.
 *
 * Not swept, for want of data a scene can't make cheaply: /client/waitlist/[entryId] (a full group
 * session and a second client), /trainer/clients/claims/[claimId] (a managed card claimed by a new
 * account), /trainer/clients/delegated/[coachingId] and /trainer/team/sessions/... (a second trainer
 * with an accepted delegation). Those flows have scenarios of their own.
 */

type Role = "client" | "trainer" | "admin";

type Route = {
  role: Role;
  /** The route as in the file tree, used as the test title. */
  route: string;
  path: (scene: Scene, people: People) => string | null;
  /** Where the route is expected to land when it is a redirect (pathname). */
  lands?: string;
  /** A known app bug that fails this route, on one project or both: the test is fixme'd with it. */
  bug?: { project?: "phone" | "desktop"; text: string };
  /** The screen lists the whole local database and takes long to check. */
  slow?: boolean;
};

type People = { client: Persona; trainer: Persona; admin: Persona };

const at = (role: Role, route: string, path?: Route["path"], lands?: string, extra: Pick<Route, "bug" | "slow"> = {}): Route => ({
  role,
  route,
  path: path ?? (() => route),
  lands,
  ...extra,
});

/** The tab bar's material lets a light control scrolled under it wash out the inactive labels. */
const COMMON = (role: Role): Route[] => [
  at(role, "/profile"),
  at(role, "/settings"),
  at(role, "/settings/plan"),
  at(role, "/settings/notifications"),
  at(role, "/settings/calendar"),
  at(role, "/settings/export"),
  at(role, "/settings/delete"),
  at(role, "/settings/licenses"),
  at(role, "/feedback", () => `/feedback?from=%2F${role === "admin" ? "admin" : role}`),
  // Terms already accepted: the consent screen sends the person on to `next`.
  at(role, "/onboarding/consent", () => "/onboarding/consent?next=%2Fsettings", "/settings"),
  at(role, "/onboarding/preferences", () => "/onboarding/preferences?next=%2Fsettings"),
];

const ROUTES: Route[] = [
  // Client zone.
  at("client", "/client"),
  at("client", "/client/sessions"),
  at("client", "/client/sessions/homework"),
  at("client", "/client/book"),
  at("client", "/client/bookings/[bookingId]", (s) => `/client/bookings/${s.bookingId}`),
  at("client", "/client/bookings/[bookingId]/reschedule", (s) => `/client/bookings/${s.bookingId}/reschedule`),
  at("client", "/client/challenges/[challengeId]", (s) => s.challengeId && `/client/challenges/${s.challengeId}`),
  at("client", "/client/checkin", () => "/client/checkin?place=Ab3_-Ab3_-Ab3_-Ab3_-Ab"),
  at("client", "/client/checkin/[sessionId]", (s) => `/client/checkin/${s.sessionIds[0]}?c=aB3_-xY9zQ`),
  at("client", "/client/diary"),
  at("client", "/client/diary/activity"),
  at("client", "/client/diary/activity/shortcut"),
  at("client", "/client/diary/food"),
  at("client", "/client/diary/food/add"),
  at("client", "/client/diary/food/target"),
  at("client", "/client/diary/food/foods"),
  at("client", "/client/diary/food/foods/new"),
  at("client", "/client/diary/food/foods/dish"),
  at("client", "/client/diary/food/foods/[foodId]", (s) => `/client/diary/food/foods/${s.foodId}`),
  at("client", "/client/diary/workouts/new"),
  at("client", "/client/diary/workouts/[logId]", (s) => `/client/diary/workouts/${s.workoutLogId}`),
  at("client", "/client/diary/workouts/[logId]/edit", (s) => `/client/diary/workouts/${s.workoutLogId}/edit`),
  at("client", "/client/passes"),
  at("client", "/client/passes/[passId]", (s) => `/client/passes/${s.passId}`),
  at("client", "/client/progress"),
  at("client", "/client/progress/badges"),
  at("client", "/client/progress/compare"),
  at("client", "/client/progress/measurements"),
  at("client", "/client/progress/photos"),
  at("client", "/client/progress/photos/new"),
  at("client", "/client/progress/records"),
  at("client", "/client/progress/reports/[month]", (s) => `/client/progress/reports/${s.month}`),
  at("client", "/client/trainers"),
  at("client", "/client/trainers/[coachingId]", (s) => `/client/trainers/${s.coachingId}`),
  at("client", "/client/trainers/[coachingId]/goal", (s) => `/client/trainers/${s.coachingId}/goal`),
  at("client", "/client/trainers/[coachingId]/intake-consent", (s) => `/client/trainers/${s.coachingId}/intake-consent`),
  at("client", "/client/trainers/[coachingId]/intake", (s) => `/client/trainers/${s.coachingId}/intake`),
  at("client", "/client/trainers/[coachingId]/referral", (s) => `/client/trainers/${s.coachingId}/referral`),
  at("client", "/client/trainers/[coachingId]/sharing", (s) => `/client/trainers/${s.coachingId}/sharing`),
  at("client", "/i/[token]", (s) => `/i/${s.inviteToken}`),
  at("client", "/trainers/[slug]", (s) => `/trainers/${s.slug}`),
  ...COMMON("client"),

  // Trainer zone.
  at("trainer", "/trainer"),
  at("trainer", "/trainer/schedule"),
  at("trainer", "/trainer/schedule/template"),
  at("trainer", "/trainer/schedule/slots"),
  at("trainer", "/trainer/sessions/new", undefined, undefined, {
  }),
  at("trainer", "/trainer/sessions/[sessionId]", (s) => `/trainer/sessions/${s.sessionIds[0]}`),
  at("trainer", "/trainer/sessions/[sessionId] (past)", (s) => `/trainer/sessions/${s.pastSessionId}`),
  at("trainer", "/trainer/sessions/[sessionId]/edit", (s) => `/trainer/sessions/${s.sessionIds[0]}/edit`),
  at("trainer", "/trainer/requests"),
  at("trainer", "/trainer/requests/[bookingId]", (s) => s.requestId && `/trainer/requests/${s.requestId}`),
  at("trainer", "/trainer/clients"),
  at("trainer", "/trainer/clients/new"),
  at("trainer", "/trainer/clients/delegated"),
  at("trainer", "/trainer/clients/[coachingId]", (s) => `/trainer/clients/${s.coachingId}`),
  at("trainer", "/trainer/clients/[coachingId]/intake", (s) => `/trainer/clients/${s.coachingId}/intake`),
  at("trainer", "/trainer/clients/[coachingId]/notes", (s) => `/trainer/clients/${s.coachingId}/notes`),
  at("trainer", "/trainer/clients/[coachingId]/nutrition", (s) => `/trainer/clients/${s.coachingId}/nutrition`),
  at("trainer", "/trainer/clients/[coachingId]/passes", (s) => `/trainer/clients/${s.coachingId}/passes`),
  at("trainer", "/trainer/clients/[coachingId]/payments", (s) => `/trainer/clients/${s.coachingId}/payments`),
  at("trainer", "/trainer/clients/[coachingId]/progress", (s) => `/trainer/clients/${s.coachingId}/progress`),
  at("trainer", "/trainer/clients/[coachingId]/reports/[month]", (s) => `/trainer/clients/${s.coachingId}/reports/${s.month}`),
  at("trainer", "/trainer/clients/[coachingId]/workouts", (s) => `/trainer/clients/${s.coachingId}/workouts`),
  at("trainer", "/trainer/clients/[coachingId]/workouts/new", (s) => `/trainer/clients/${s.coachingId}/workouts/new`),
  at("trainer", "/trainer/clients/[coachingId]/workouts/[logId]", (s) => `/trainer/clients/${s.coachingId}/workouts/${s.pairLogId}`),
  at(
    "trainer",
    "/trainer/clients/[coachingId]/workouts/[logId]/edit",
    (s) => `/trainer/clients/${s.coachingId}/workouts/${s.pairLogId}/edit`,
  ),
  at("trainer", "/trainer/clients/[coachingId]/workouts/homework/new", (s) => `/trainer/clients/${s.coachingId}/workouts/homework/new`),
  at(
    "trainer",
    "/trainer/clients/[coachingId]/workouts/homework/[homeworkId]",
    (s) => s.homeworkId && `/trainer/clients/${s.coachingId}/workouts/homework/${s.homeworkId}`,
  ),
  at("trainer", "/trainer/money"),
  at("trainer", "/trainer/money/packages"),
  at("trainer", "/trainer/more"),
  at("trainer", "/trainer/analytics"),
  at("trainer", "/trainer/checkin-qr"),
  at("trainer", "/trainer/exercises"),
  at("trainer", "/trainer/exercises/new"),
  at("trainer", "/trainer/exercises/[exerciseId]", (s) => `/trainer/exercises/${s.exerciseId}`),
  at("trainer", "/trainer/exercises/[exerciseId] (own)", (s) => `/trainer/exercises/${s.ownExerciseId}`),
  at("trainer", "/trainer/exercises/[exerciseId]/edit", (s) => `/trainer/exercises/${s.ownExerciseId}/edit`),
  at("trainer", "/trainer/templates"),
  at("trainer", "/trainer/templates/new"),
  at("trainer", "/trainer/templates/[templateId]", (s) => `/trainer/templates/${s.templateId}`),
  at("trainer", "/trainer/groups"),
  at("trainer", "/trainer/groups/[groupId]", (s) => s.groupId && `/trainer/groups/${s.groupId}`),
  at(
    "trainer",
    "/trainer/groups/[groupId]/challenges/[challengeId]",
    (s) => s.challengeId && `/trainer/groups/${s.groupId}/challenges/${s.challengeId}`,
  ),
  at("trainer", "/trainer/nutrition"),
  at("trainer", "/trainer/links"),
  at("trainer", "/trainer/showcase"),
  at("trainer", "/trainer/profile"),
  ...["profile", "format", "locations", "region", "cancellation"].map((section) =>
    at(
      "trainer",
      `/trainer/profile/${section}`,
      () => `/trainer/profile/${section}`,
      undefined,
      {},
    ),
  ),
  at("trainer", "/trainer/referrals"),
  at("trainer", "/trainer/reviews"),
  at("trainer", "/trainer/invite-trainers"),
  at("trainer", "/trainer/verification"),
  at("trainer", "/trainer/team"),
  at("trainer", "/trainer/team/accept", () => "/trainer/team/accept?token=not-a-token"),
  at("trainer", "/contact/[id]", (s) => s.contactRequestId && `/contact/${s.contactRequestId}`),
  at("trainer", "/onboarding/trainer/done"),
  ...COMMON("trainer"),

  // Admin.
  at("admin", "/admin"),
  at("admin", "/admin/users"),
  at("admin", "/admin/users/[id]", (_, people) => `/admin/users/${people.client.userId}`),
  at("admin", "/admin/users/[id] (trainer)", (_, people) => `/admin/users/${people.trainer.userId}`),
  // Lists every trainer of the database (no limit): thousands of rows after a few suite runs.
  at("admin", "/admin/analytics", undefined, undefined, { slow: true }),
  at("admin", "/admin/analytics/trainers/[trainerId]", (_, people) => `/admin/analytics/trainers/${people.trainer.userId}`),
  at("admin", "/admin/audit"),
  at("admin", "/admin/feedback"),
  at("admin", "/admin/feedback/[id]", (s) => `/admin/feedback/${s.feedbackId}`),
  at("admin", "/admin/invites"),
  at("admin", "/admin/plans"),
  at("admin", "/admin/reviews"),
  at("admin", "/admin/reviews/[id]", (s) => s.reportId && `/admin/reviews/${s.reportId}`),
  at("admin", "/admin/stats"),
  at("admin", "/admin/verification"),
  ...COMMON("admin"),
];

/** Strings that only show up when a value or a translation went missing. */
const RAW = [
  { what: "undefined", pattern: /\bundefined\b/ },
  { what: "NaN", pattern: /\bNaN\b/ },
  { what: "null", pattern: /\bnull\b/ },
  { what: "an {placeholder}", pattern: /\{[a-zA-Z_]+\}/ },
  // A dictionary path such as trainer.money.title: three dotted lowercase-led words, not a domain.
  {
    what: "a dictionary key",
    pattern: /\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+\.(?!(?:com|ru|org|net|app|io|dev)\b)[a-z][a-zA-Z]+\b/,
  },
];

/** Problems of the screen as it is now: sideways scroll, cut headings, raw strings. */
async function layoutProblems(page: Persona["page"]): Promise<string[]> {
  const found = await page.evaluate(() => {
    const problems: string[] = [];
    const root = document.documentElement;
    if (root.scrollWidth > window.innerWidth) problems.push(`page scrolls sideways: ${root.scrollWidth}px wide in ${window.innerWidth}px`);
    for (const h1 of Array.from(document.querySelectorAll("h1"))) {
      const box = h1.getBoundingClientRect();
      if (!box.width || getComputedStyle(h1).visibility === "hidden") continue;
      if (h1.scrollWidth > h1.clientWidth + 1 || h1.scrollHeight > h1.clientHeight + 1) {
        problems.push(
          `h1 "${h1.textContent?.trim()}" is cut: ${h1.scrollWidth}×${h1.scrollHeight} in ${h1.clientWidth}×${h1.clientHeight}`,
        );
      }
      if (box.right > window.innerWidth + 1) problems.push(`h1 "${h1.textContent?.trim()}" runs past the screen edge`);
    }
    return { problems, text: document.body.innerText };
  });
  for (const { what, pattern } of RAW) {
    const match = pattern.exec(found.text);
    if (match) {
      const around = found.text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).replace(/\s+/g, " ");
      found.problems.push(`shows ${what}: "…${around}…"`);
    }
  }
  return found.problems;
}

for (const route of ROUTES) {
  test(`${route.role} ${route.route} renders cleanly in both themes`, async ({ trainer, client, admin, baseURL }, testInfo) => {
    test.fixme(!!route.bug && (!route.bug.project || route.bug.project === testInfo.project.name), route.bug?.text);
    if (route.slow) test.slow();
    const people = { client, trainer, admin };
    const scene = await buildScene(trainer, client, admin);
    const path = route.path(scene, people);
    test.skip(!path, `the scene could not make this route's data: ${JSON.stringify(scene.missing)}`);
    const { page, context } = people[route.role];

    for (const scheme of SCHEMES) {
      await test.step(`${scheme} theme`, async () => {
        await context.addCookies([{ name: "dafit-theme", value: scheme, url: baseURL }]);
        await page.emulateMedia({ colorScheme: scheme });
        const errors = collectErrors(page);
        const response = await page.goto(path!, { waitUntil: "networkidle" });
        expect.soft(response?.status(), "HTTP status").toBe(200);
        const landed = new URL(page.url()).pathname;
        expect.soft(landed, "where the route lands").toBe(route.lands ?? path!.split("?")[0]);
        await expect.soft(page.locator("html")).toHaveAttribute("data-theme", scheme);
        await settle(page);
        await expectAccessible(page).catch((error: Error) => expect.soft(error.message, "axe").toBe(""));
        expect.soft(await layoutProblems(page), "layout").toEqual([]);
        expect.soft(errors(), "page and console errors").toEqual([]);
        page.removeAllListeners("console");
        page.removeAllListeners("pageerror");
        if (testInfo.errors.length) {
          await page.screenshot({
            path: testInfo.outputPath(`${scheme}.png`),
            fullPage: true,
          });
        }
      });
    }
  });
}
