import "server-only";
import { z } from "zod";

/**
 * Server-only environment. The ONLY module allowed to read secret env vars.
 * See docs/adr/0002-secrets-handling.md.
 *
 * Parsed lazily (first call) so `next build` works without secrets;
 * `instrumentation.ts` calls it at server boot to fail fast.
 */
const schema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/, "must look like <id>:<secret>"),
  TELEGRAM_LOGIN_CLIENT_ID: z.string().min(1),
  TELEGRAM_LOGIN_CLIENT_SECRET: z.string().min(1),
  /** Max age of Mini App initData accepted for sign-in, seconds. */
  TELEGRAM_INIT_DATA_MAX_AGE: z.coerce.number().int().positive().default(3600),
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
