import { CalendarDays, ChartLine, Dumbbell, Ellipsis, House, User, Users, Wallet, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { TabIcon, TabId } from "@/lib/navigation/zones";

/** Lucide components for the icon names in src/lib/navigation/zones.ts. */
export const TAB_ICONS: Record<TabIcon, LucideIcon> = {
  house: House,
  "calendar-days": CalendarDays,
  users: Users,
  wallet: Wallet,
  ellipsis: Ellipsis,
  dumbbell: Dumbbell,
  "chart-line": ChartLine,
  user: User,
};

/** Tab label in the current language. Trainer and client tab ids never overlap. */
export function tabLabel(t: Dictionary, id: TabId): string {
  const labels: Record<TabId, string> = { ...t.tabs.trainer, ...t.tabs.client };
  return labels[id];
}
