import { loadSimulatorGrid } from "@/lib/trainer-analytics/simulator-grid";
import { PriceSimulator } from "./price-simulator";

/** The price simulator with the trainer's price grid loaded, for the «новые цены» variant. */
export async function PriceSimulatorSection({ base }: { base: { currency: string; monthlyMinor: number }[] }) {
  const packages = base.length > 0 ? await loadSimulatorGrid() : [];
  return <PriceSimulator base={base} packages={packages} />;
}
