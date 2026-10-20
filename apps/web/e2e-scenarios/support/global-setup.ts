import { assertLocalSupabase, supabaseEnv } from "./env";

/** Fails fast, before any browser starts, when the suite is not pointed at a running local Supabase. */
export default async function globalSetup() {
  assertLocalSupabase();
  const { url, publishableKey } = supabaseEnv();
  const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: publishableKey } }).catch(() => null);
  if (!health?.ok) throw new Error(`no local Supabase answers at ${url}: run \`supabase start\` at the repo root`);
}
