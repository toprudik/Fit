import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { expectAccessible, settle } from "../../e2e/support";
import type { Database } from "../../src/lib/supabase/database.types";
import { supabaseEnv } from "./env";
import { adminDb, ok, type Db, type Persona } from "./personas";

/*
 * Helpers for the trainer onboarding and trainer-clients scenarios. Trainer invites come from an admin
 * account of this file's own (personas.ts keeps its inviter private), signed in the same way.
 */

let inviter: Promise<Db> | undefined;

function inviterDb(): Promise<Db> {
  inviter ??= (async () => {
    const worker = Number(process.env.TEST_WORKER_INDEX ?? 0);
    const telegramId = 9_500_000_000 + (Date.now() % 10_000_000) * 10 + worker;
    const email = `tg${telegramId}@users.fit.invalid`;
    const created = await adminDb().auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { telegram_id: telegramId },
    });
    if (created.error) throw new Error(`inviter: ${created.error.message}`);
    const id = created.data.user.id;
    ok(
      await adminDb()
        .from("profiles")
        .upsert({ id, telegram_id: telegramId, first_name: "Выдающий" }),
      "inviter profile",
    );
    ok(
      await adminDb().from("user_roles").insert({ user_id: id, role: "admin" }),
      "inviter role",
    );
    const link = await adminDb().auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (link.error) throw new Error(`generateLink: ${link.error.message}`);
    const { url, publishableKey } = supabaseEnv();
    const db = createClient<Database>(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await db.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (error) throw new Error(`verifyOtp: ${error.message}`);
    return db;
  })();
  return inviter;
}

/** A fresh trainer invite code, as an admin issues it on /admin. */
export async function newTrainerInviteCode(): Promise<string> {
  const db = await inviterDb();
  return ok(
    await db.rpc("admin_create_trainer_invite", { p_note: "e2e onboarding" }),
    "trainer invite",
  )[0].code;
}

/** The trainer's working client link token (/i/<token>), made on first use. */
export async function clientInviteToken(trainer: Persona): Promise<string> {
  return ok(await trainer.db.rpc("my_client_invite"), "client invite")[0].token;
}

/** Waits for a server action's redirect to land on a path (search ignored). */
export async function expectPath(page: Page, path: string | RegExp) {
  await page.waitForURL((url) =>
    typeof path === "string"
      ? url.pathname === path
      : path.test(url.pathname + url.search),
  );
}

/** axe once the screen has finished its push or tab transition, so a fade in progress is not measured. */
export async function expectSettledAccessible(page: Page) {
  await settle(page);
  await expectAccessible(page);
}
