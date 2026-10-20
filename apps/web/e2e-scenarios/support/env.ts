/*
 * Where the scenario suite runs: a local Supabase (`supabase start` at the repo root) and the app built
 * for it. scripts/e2e-scenarios.sh reads the values from `supabase status` and passes them in; nothing
 * here may point at a hosted project.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run the suite with scripts/e2e-scenarios.sh`);
  return value;
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** The suite writes and wipes rows as it goes, so it refuses anything but a database on this machine. */
export function assertLocalSupabase() {
  const { hostname } = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error("the scenario suite runs only against a local Supabase (127.0.0.1 or localhost)");
  }
}

export const supabaseEnv = () => ({
  url: required("NEXT_PUBLIC_SUPABASE_URL"),
  publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  secretKey: required("SUPABASE_SECRET_KEY"),
});

/**
 * The bot token the server checks initData against. A made-up one: the suite signs initData with it
 * the way Telegram signs with the real token, so the sign-in endpoint runs for real.
 */
export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "1:e2e-scenarios";
