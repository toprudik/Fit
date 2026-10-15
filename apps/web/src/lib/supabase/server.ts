import "server-only";
import { createServerClient } from "@supabase/ssr";
import { io } from "next/cache";
import { cookies } from "next/headers";
import { clientEnv } from "@/env/client";
import { sessionCookieOptions } from "./cookie-options";
import type { Database } from "./database.types";

/** Supabase client acting as the signed-in user (publishable key + session cookies, RLS applies). */
export async function createSupabaseServerClient() {
  // supabase-js checks the session's expiry against Date.now() as soon as the client exists. Next
  // prerenders each route's App Shell with the visitor's cookies (partialPrefetching), and reading
  // the clock there aborts that prerender with an error. io() keeps this client out of every
  // prerender; page requests and route handlers get it as before.
  await io();
  const cookieStore = await cookies();
  return createServerClient<Database>(clientEnv.NEXT_PUBLIC_SUPABASE_URL, clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: sessionCookieOptions,
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them.
        }
      },
    },
  });
}
