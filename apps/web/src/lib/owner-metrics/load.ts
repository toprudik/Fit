import "server-only";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { cohortWeeks, type OwnerSource, type OwnerWeeks } from "./metrics";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Everything /admin/stats shows, read as the admin: the database refuses anyone else (42501), so a caller that
 * is not an admin gets an error and nothing else.
 */
export async function loadOwnerMetrics(supabase: Supabase, weeks: OwnerWeeks) {
  const [summary, success, channels, weekly, cohorts] = await Promise.all([
    supabase.rpc("admin_owner_summary").single(),
    supabase.rpc("admin_owner_success").single(),
    supabase.rpc("admin_owner_sources"),
    supabase.rpc("admin_owner_weekly", { p_weeks: weeks }),
    supabase.rpc("admin_owner_cohorts", { p_weeks: cohortWeeks(weeks) }),
  ]);
  if (summary.error) throw new Error(`loading the owner summary failed: ${summary.error.code}`);
  if (success.error) throw new Error(`loading the owner success signals failed: ${success.error.code}`);
  if (channels.error) throw new Error(`loading the owner channels failed: ${channels.error.code}`);
  if (weekly.error) throw new Error(`loading the owner weeks failed: ${weekly.error.code}`);
  if (cohorts.error) throw new Error(`loading the owner cohorts failed: ${cohorts.error.code}`);
  return { summary: summary.data, success: success.data, channels: channels.data as OwnerSource[], weekly: weekly.data, cohorts: cohorts.data };
}
