import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { HEALTH_CONSENT, REQUIRED_CONSENTS } from "../../src/lib/consent/required";
import { HEALTH_NOTICE_COOKIE, HEALTH_NOTICE_VERSION } from "../../src/lib/health-notice/notice";
import type { Database } from "../../src/lib/supabase/database.types";
import { BOT_TOKEN, supabaseEnv } from "./env";

/*
 * People of the scenario suite. Each one is a real account in the local Supabase, signed in through the
 * app's own Mini App endpoint with initData signed like Telegram signs it. Names and ids are made up;
 * every test makes its own people, so tests never share rows and run in parallel.
 */

export type Db = SupabaseClient<Database>;

export type Persona = {
  userId: string;
  telegramId: number;
  firstName: string;
  /** A browser of its own, signed in, in the persona's language. */
  context: BrowserContext;
  page: Page;
  /** The same account through supabase-js, under RLS: for setting the scene the way the app's RPCs do. */
  db: Db;
};

let admin: Db | undefined;

/** Bypasses RLS. Only for what no user can do (roles, a ready-made admin), never to stand in for a screen. */
export function adminDb(): Db {
  const { url, secretKey } = supabaseEnv();
  admin ??= createClient<Database>(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return admin;
}

let sequence = 0;

/** Telegram ids no real person has here: 9 000 000 000 and up, unique per run and worker. */
function nextTelegramId(): number {
  const worker = Number(process.env.TEST_WORKER_INDEX ?? 0);
  sequence += 1;
  return 9_000_000_000 + (Date.now() % 10_000_000) * 100 + worker * 10 + (sequence % 10);
}

/** initData as Telegram signs it for the bot (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app). */
export function signedInitData(user: { id: number; first_name: string; last_name?: string; username?: string; language_code: string }) {
  const params = new URLSearchParams({
    user: JSON.stringify({ ...user, allows_write_to_pm: true }),
    chat_instance: "-4242",
    chat_type: "sender",
    auth_date: String(Math.floor(Date.now() / 1000)),
  });
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dataCheckString).digest("hex"));
  return params.toString();
}

/** A second session for the same account, outside the browser, through the same magic-link path the server uses. */
async function userDb(telegramId: number): Promise<Db> {
  const { url, publishableKey } = supabaseEnv();
  const link = await adminDb().auth.admin.generateLink({ type: "magiclink", email: `tg${telegramId}@users.fit.invalid` });
  if (link.error) throw new Error(`generateLink: ${link.error.message}`);
  const db = createClient<Database>(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await db.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (error) throw new Error(`verifyOtp: ${error.message}`);
  return db;
}

export type PersonaOptions = {
  firstName: string;
  lastName?: string;
  locale?: "ru" | "en";
  /** Give the consents in force, health data included, as the consent screens do. Default true. */
  consent?: boolean;
};

/** Signs a new person in through POST /api/auth/telegram/mini-app and opens a page for them. */
export async function newPersona(browser: Browser, baseURL: string, { firstName, lastName, locale = "ru", consent = true }: PersonaOptions): Promise<Persona> {
  const telegramId = nextTelegramId();
  const context = await browser.newContext({
    baseURL,
    locale: locale === "ru" ? "ru-RU" : "en-US",
    timezoneId: "Europe/Moscow",
  });
  // Read the health notice already, as on a device used before; the health-consent scenario shows it afresh.
  await context.addCookies([{ name: HEALTH_NOTICE_COOKIE, value: HEALTH_NOTICE_VERSION, url: baseURL }]);
  const answer = await context.request.post("/api/auth/telegram/mini-app", {
    headers: { origin: new URL(baseURL).origin, "content-type": "application/json" },
    data: { initData: signedInitData({ id: telegramId, first_name: firstName, last_name: lastName, language_code: locale }) },
  });
  if (!answer.ok()) throw new Error(`sign-in answered ${answer.status()}: ${await answer.text()}`);
  const db = await userDb(telegramId);
  const { data } = await db.auth.getUser();
  const userId = data.user!.id;
  if (consent) await acceptConsents(db, userId);
  return { userId, telegramId, firstName, context, page: await context.newPage(), db };
}

/** Throws with the RPC's message: a scene that failed to set up must fail the test loudly. */
export function ok<T>(result: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.code ?? ""} ${result.error.message}`);
  return result.data as T;
}

export async function acceptConsents(db: Db, userId: string) {
  const rows = [...REQUIRED_CONSENTS, HEALTH_CONSENT].map(({ kind, version }) => ({ user_id: userId, kind, version }));
  ok(await db.from("consents").insert(rows), "consents");
}

/** Gives the admin role, which only the team grants (user_roles has no user policy). */
export async function makeAdmin(persona: Persona) {
  ok(await adminDb().from("user_roles").insert({ user_id: persona.userId, role: "admin" }), "admin role");
}

/** Makes the persona a trainer the way an invite does: an admin's code, redeemed by the persona. */
export async function makeTrainer(persona: Persona) {
  const invite = ok(await adminInviteDb().then((db) => db.rpc("admin_create_trainer_invite", { p_note: "e2e" })), "trainer invite");
  ok(await persona.db.rpc("redeem_trainer_invite", { p_code: invite[0].code }), "redeem trainer invite");
}

let inviter: Promise<Db> | undefined;

/** A standing admin account that issues trainer invites for the suite, made once per worker. */
function adminInviteDb(): Promise<Db> {
  inviter ??= (async () => {
    const telegramId = nextTelegramId();
    const created = await adminDb().auth.admin.createUser({
      email: `tg${telegramId}@users.fit.invalid`,
      email_confirm: true,
      app_metadata: { telegram_id: telegramId },
    });
    if (created.error) throw new Error(`inviter: ${created.error.message}`);
    const id = created.data.user.id;
    ok(await adminDb().from("profiles").upsert({ id, telegram_id: telegramId, first_name: "Инвайтер" }), "inviter profile");
    ok(await adminDb().from("user_roles").insert({ user_id: id, role: "admin" }), "inviter role");
    return userDb(telegramId);
  })();
  return inviter;
}

/** The persona becomes a client of the trainer through the trainer's client link (join_by_invite). */
export async function joinTrainer(client: Persona, trainer: Persona): Promise<string> {
  const invite = ok(await trainer.db.rpc("my_client_invite"), "client invite");
  return ok(await client.db.rpc("join_by_invite", { p_token: invite[0].token }), "join by invite");
}
