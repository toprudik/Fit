import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture checks over every route handler and Server Action file, so a new one can't skip the rules of
 * ADR 0004 (CSRF), ADR 0002 (secrets) and CLAUDE.md (the secret-key client never serves user data).
 */
const SRC = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(SRC).filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path));
const rel = (path: string) => relative(SRC, path).split("\\").join("/");
const source = (path: string) => readFileSync(path, "utf8");
const routes = files.filter((path) => /\/route\.tsx?$/.test(path));

/**
 * Route handlers that change state without a browser session. Each proves the caller another way, named here so
 * a reviewer sees the list grow.
 */
const MACHINE_CALLERS: Record<string, RegExp> = {
  // pg_cron through pg_net, with CRON_SECRET from Supabase Vault.
  "app/api/cron/notifications/route.ts": /hasBearer\(request\.headers\.get\("authorization"\), env\.CRON_SECRET\)/,
  "app/api/cron/privacy/route.ts": /hasBearer\(request\.headers\.get\("authorization"\), env\.CRON_SECRET\)/,
  // The bot, with a secret derived from the bot token.
  "app/api/bot/actions/route.ts": /isBotAuthorized\(request\.headers\.get\("authorization"\)/,
  // iOS Shortcuts, with the user's own steps token; public.ingest_steps checks its hash and the hourly limit.
  "app/api/ingest/steps/route.ts": /Bearer/,
};

const STATE_CHANGING = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

describe("route handlers", () => {
  it("are found", () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it.each(routes.filter((path) => STATE_CHANGING.test(source(path))).map(rel))(
    "%s checks the origin (CSRF) or a machine caller's secret first",
    (path) => {
      const code = source(join(SRC, path));
      const machine = MACHINE_CALLERS[path];
      if (machine) {
        expect(code).toMatch(machine);
        return;
      }
      expect(code).toMatch(/import \{ isSameOrigin \} from "@\/lib\/auth\/same-origin"/);
      // The check runs before the body is read or a client is made.
      const check = code.indexOf("isSameOrigin(request)");
      expect(check).toBeGreaterThan(-1);
      for (const later of ["request.json(", "createSupabaseServerClient(", "createSupabaseAdminClient("]) {
        const at = code.indexOf(later);
        if (at > -1) expect(at).toBeGreaterThan(check);
      }
    },
  );

  it("GET handlers change no account: none calls an update, insert, delete or upsert itself", () => {
    const writers = routes
      .filter((path) => !STATE_CHANGING.test(source(path)))
      // cookies.delete() clears the OIDC cookie of /auth/telegram/callback; that is the browser's, not the account.
      .filter((path) => /(?<!cookies)\.(insert|update|delete|upsert)\(/.test(source(path)))
      .map(rel);
    expect(writers).toEqual([]);
  });

  it("the secret-key client serves only the routes without a user session", () => {
    const admin = routes.filter((path) => source(path).includes("createSupabaseAdminClient")).map(rel).sort();
    expect(admin).toEqual([
      "app/api/calendar/[token]/route.ts",
      "app/api/cron/notifications/route.ts",
      "app/api/cron/privacy/route.ts",
      "app/api/ingest/steps/route.ts",
    ]);
  });
});

const actions = files.filter((path) => /^["']use server["'];?/m.test(source(path).trimStart().split("\n")[0] ?? ""));

describe("Server Actions", () => {
  it("are found", () => {
    expect(actions.length).toBeGreaterThan(40);
  });

  it("use the secret-key client only where the database checks the caller first", () => {
    const admin = actions.filter((path) => source(path).includes("createSupabaseAdminClient")).map(rel).sort();
    // admin/user-actions: bans the auth user only after admin_block_user / admin_unblock_user (as the user) passed.
    // contact/actions: accept_contact_request with the session's own user id, after Telegram's signature matched it.
    expect(admin).toEqual(["lib/admin/user-actions.ts", "lib/contact/actions.ts"]);
  });

  it.each(actions.map(rel))("%s never reads auth.getUser() from the client or trusts initDataUnsafe", (path) => {
    const code = source(join(SRC, path));
    expect(code).not.toMatch(/initDataUnsafe/);
    // The session's user comes from getClaims() (verified JWT) or the database's auth.uid(), never getSession().
    expect(code).not.toMatch(/auth\.getSession\(/);
  });
});

describe("client code", () => {
  const clientFiles = files.filter((path) => /^["']use client["']/.test(source(path).trimStart()));

  it("are found", () => {
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it.each(clientFiles.map(rel))("%s imports no server-only module", (path) => {
    const code = source(join(SRC, path));
    for (const banned of ["@/env/server", "@/lib/supabase/admin", "@/lib/supabase/server", "server-only", "node:crypto"]) {
      expect(code).not.toContain(`"${banned}"`);
    }
  });

  it("no source file trusts initDataUnsafe", () => {
    expect(files.filter((path) => source(path).includes("initDataUnsafe")).map(rel)).toEqual([]);
  });

  it("reads secrets only through env/server.ts", () => {
    const secretNames = /process\.env\.(SUPABASE_SECRET_KEY|TELEGRAM_BOT_TOKEN|TELEGRAM_LOGIN_CLIENT_SECRET|CRON_SECRET|GITHUB_FEEDBACK_TOKEN)/;
    expect(files.filter((path) => secretNames.test(source(path))).map(rel)).toEqual([]);
  });
});
