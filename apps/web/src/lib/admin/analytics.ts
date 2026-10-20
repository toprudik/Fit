import "server-only";
import type { AnalyticsPeriod } from "./analytics-format";
import { requireAdmin } from "./require-admin";

export async function loadPlatform(days: AnalyticsPeriod) {
  const { supabase } = await requireAdmin();
  const [platform, beta] = await Promise.all([
    supabase.rpc("admin_analytics_platform", { p_days: days }).single(),
    supabase.rpc("admin_beta_metrics").single(),
  ]);
  if (platform.error) throw new Error(`loading the platform analytics failed: ${platform.error.code}`);
  if (beta.error) throw new Error(`loading the beta metrics failed: ${beta.error.code}`);
  return { platform: platform.data, beta: beta.data };
}

export async function loadTrainers(days: AnalyticsPeriod) {
  const { supabase } = await requireAdmin();
  // The busiest 200, like the clients: the full list grows with the platform and the page stops rendering.
  const { data, error } = await supabase.rpc("admin_analytics_trainers", { p_days: days }).limit(200);
  if (error) throw new Error(`loading the trainers analytics failed: ${error.code}`);
  return data;
}

export async function loadClients(days: AnalyticsPeriod) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_analytics_clients", { p_days: days, p_limit: 200 });
  if (error) throw new Error(`loading the clients analytics failed: ${error.code}`);
  return data;
}

/** One trainer; the database writes the opening to the audit log (§8.3). Null for a user who is not a trainer. */
export async function loadTrainer(trainerId: string, days: AnalyticsPeriod) {
  const { supabase, timeZone } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_analytics_trainer", { p_trainer_id: trainerId, p_days: days }).maybeSingle();
  if (error?.message === "trainer_not_found") return null;
  if (error) throw new Error(`loading a trainer's analytics failed: ${error.code}`);
  return data ? { ...data, timeZone } : null;
}
