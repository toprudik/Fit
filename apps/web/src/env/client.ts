import { z } from "zod";

/**
 * Browser-safe environment. Only NEXT_PUBLIC_* values, which Next.js inlines at build time,
 * so each one must be referenced literally below.
 */
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  /** Sentry DSN (ADR 0017); unset or empty keeps error reporting off. A DSN only lets a client send events. */
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess((value) => (value === "" ? undefined : value), z.url().optional()),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

if (!parsed.success) {
  const names = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
  throw new Error(`Invalid public environment: ${names.join(", ")}. See .env.example.`);
}

export const clientEnv = parsed.data;
