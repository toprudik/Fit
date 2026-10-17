import "server-only";

import { todayIn } from "@/lib/passes/present";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { previousMonth, reportFrom, type MonthlyReport } from "./report";

/** The signed-in client's report of a finished month (YYYY-MM-01), null when it has none, or "signed-out". */
export async function loadMonthlyReport(month: string): Promise<MonthlyReport | null | "signed-out"> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  if (!session?.claims.sub) return "signed-out";
  const { data, error } = await supabase.rpc("my_monthly_report", { p_month: month });
  if (error) throw new Error(`loading the monthly report failed: ${error.code}`);
  return reportFrom(data);
}

/** Last month's report of the signed-in client for the entry on "Прогресс", or null. */
export async function loadLastMonthReport(): Promise<MonthlyReport | null> {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const me = session?.claims.sub;
  if (!me) return null;
  const { data: settings } = await supabase.from("user_settings").select("time_zone").eq("user_id", me).maybeSingle();
  const month = previousMonth(todayIn(settings?.time_zone ?? "Europe/Moscow"));
  const { data, error } = await supabase.rpc("my_monthly_report", { p_month: month });
  if (error) {
    console.error("loading last month's report failed", error.code);
    return null;
  }
  return reportFrom(data);
}
