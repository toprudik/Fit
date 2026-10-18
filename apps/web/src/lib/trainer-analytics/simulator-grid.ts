import "server-only";
import { loadScheduleOwner } from "@/lib/schedule/load";
import { today } from "@/lib/schedule/time";
import type { SimulatorPackage } from "./grid-raise";
import { simulatorBase } from "./period";

/**
 * The trainer's live packages for the price simulator, each with the paid passes it sold over the simulator base
 * (the last three full months). Bonus, free and cancelled passes don't count. Empty when nobody is signed in.
 */
export async function loadSimulatorGrid(): Promise<SimulatorPackage[]> {
  const owner = await loadScheduleOwner();
  if (!owner) return [];
  const base = simulatorBase(today(owner.timeZone));
  const [packages, passes] = await Promise.all([
    owner.supabase
      .from("packages")
      .select("id, title, price_minor, currency, sessions_count, sort_order")
      .eq("trainer_id", owner.userId)
      .is("archived_at", null)
      .order("currency")
      .order("sessions_count")
      .order("sort_order"),
    owner.supabase
      .from("passes")
      .select("package_id")
      .eq("trainer_id", owner.userId)
      .eq("status", "active")
      .eq("is_bonus", false)
      .gt("price_minor", 0)
      .not("package_id", "is", null)
      .gte("starts_on", base.from)
      .lt("starts_on", base.to),
  ]);
  if (packages.error) throw new Error(`loading the simulator packages failed: ${packages.error.code}`);
  if (passes.error) throw new Error(`loading the simulator sales failed: ${passes.error.code}`);

  const sold = new Map<string, number>();
  for (const pass of passes.data) if (pass.package_id) sold.set(pass.package_id, (sold.get(pass.package_id) ?? 0) + 1);
  return packages.data.map((row) => ({
    id: row.id,
    title: row.title,
    priceMinor: row.price_minor,
    currency: row.currency,
    sold: sold.get(row.id) ?? 0,
  }));
}
