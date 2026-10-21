import { connection } from "next/server";

/**
 * Keeps the web function warm (migration 20261021231947_warm_web.sql): Supabase pg_cron calls it every three
 * minutes, so a Mini App launch after a quiet spell does not wait for a cold start. It reads and writes nothing.
 */
export async function GET() {
  // With Cache Components a GET handler is prerendered unless it waits for a request; a cached answer would never
  // reach the function.
  await connection();
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
