import { BadgeCheck, ChartColumn, ClipboardList, Flag, Gem, Gift, KeyRound, LayoutDashboard, MessageSquareText, ScrollText, Star, TrendingUp, Users, type LucideIcon } from "lucide-react";
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
  { id: "referralBonuses", href: "/admin/referral-bonuses", segment: "referral-bonuses", icon: Gift },
  { id: "feedback", href: "/admin/feedback", segment: "feedback", icon: MessageSquareText },
  { id: "reviews", href: "/admin/reviews", segment: "reviews", icon: Star },
  { id: "reports", href: "/admin/reports", segment: "reports", icon: Flag },
  { id: "analytics", href: "/admin/analytics", segment: "analytics", icon: ChartColumn },
  { id: "stats", href: "/admin/stats", segment: "stats", icon: TrendingUp },
  { id: "waitlist", href: "/admin/waitlist", segment: "waitlist", icon: ClipboardList },
  { id: "audit", href: "/admin/audit", segment: "audit", icon: ScrollText },
];
