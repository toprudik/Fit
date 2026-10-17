import "server-only";
import { z } from "zod";

/**
 * Server-only environment. The ONLY module allowed to read secret env vars.
 * See docs/adr/0002-secrets-handling.md.
 *
 * Parsed lazily (first call) so `next build` works without secrets;
 * `instrumentation.ts` calls it at server boot to fail fast.
 */
/** Unset and empty are the same: .env.example lists optional names with empty values. */
const optional = <T extends z.ZodType>(type: T) => z.preprocess((value) => (value === "" ? undefined : value), type.optional());

const schema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/, "must look like <id>:<secret>"),
  TELEGRAM_LOGIN_CLIENT_ID: z.string().min(1),
  TELEGRAM_LOGIN_CLIENT_SECRET: z.string().min(1),
  /** Max age of Mini App initData that may start a new session, seconds. */
  TELEGRAM_INIT_DATA_MAX_AGE: z.coerce.number().int().positive().default(3600),
  /**
   * Bearer secret of POST /api/cron/notifications, the same value as in Supabase Vault (ADR 0006). Optional so a
   * deployment without it still serves the app; the route answers 503 until it is set.
   */
  CRON_SECRET: optional(z.string().regex(/^[A-Za-z0-9_-]{32,256}$/, "must be 32-256 characters [A-Za-z0-9_-]")),
  /** Bot whose Mini App opens invite links (t.me/<bot>?startapp=…). Locally your own dev bot. */
  TELEGRAM_BOT_USERNAME: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^[A-Za-z][A-Za-z0-9_]{3,31}$/, "must be a bot username without @").default("fitconnection_bot"),
  ),
  /** Telegram group that gets the team messages (PRD §3 А1, А2). Optional until those messages exist. */
  TELEGRAM_ADMIN_CHAT_ID: optional(z.coerce.number().int()),
  /**
   * File a GitHub issue for each feedback message (PRD FDBK-1), only when both are set. No default repository:
   * feedback text is personal and must not land in a public one. Without them the message stays in the admin inbox.
   */
  GITHUB_FEEDBACK_TOKEN: optional(z.string().regex(/^[A-Za-z0-9_]{20,255}$/, "must be a GitHub token")),
  GITHUB_FEEDBACK_REPO: optional(z.string().regex(/^[\w.-]+\/[\w.-]+$/, "must be owner/name")),
  /** Set by Vercel; the feedback form records it as the app version. */
  VERCEL_GIT_COMMIT_SHA: optional(z.string().max(64)),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
    throw new Error(`Invalid server environment: ${names.join(", ")}. See .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
