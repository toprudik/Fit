import { BadgeCheck, Gem, KeyRound, LayoutDashboard, ScrollText, Users, type LucideIcon } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";

export type AdminSection = keyof Dictionary["adminShell"]["sections"];

/**
 * Sections of /admin in menu order (screens.md §3.5, wave-1 part). `segment` is the first path segment under
 * /admin, null for the overview at /admin itself.
 */
export const ADMIN_SECTIONS: readonly { id: AdminSection; href: string; segment: string | null; icon: LucideIcon }[] = [
  { id: "overview", href: "/admin", segment: null, icon: LayoutDashboard },
  { id: "invites", href: "/admin/invites", segment: "invites", icon: KeyRound },
  { id: "verification", href: "/admin/verification", segment: "verification", icon: BadgeCheck },
  { id: "users", href: "/admin/users", segment: "users", icon: Users },
  { id: "plans", href: "/admin/plans", segment: "plans", icon: Gem },
  { id: "audit", href: "/admin/audit", segment: "audit", icon: ScrollText },
];
