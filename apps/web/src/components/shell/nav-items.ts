import {
  Award,
  CalendarDays,
  ChartColumn,
  ChartLine,
  CircleHelp,
  ClipboardList,
  Dumbbell,
  Ellipsis,
  Gift,
  Handshake,
  House,
  QrCode,
  Salad,
  ScanLine,
  Star,
  Store,
  Trophy,
  User,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { helpPath } from "@/components/help/path";
import type { Dictionary } from "@/i18n/dictionaries";
import type { TabIcon, TabId, Zone } from "@/lib/navigation/zones";

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

/**
 * In the Mini App at fullscreen the profile leaves the header for the tab bar: the zone's last tab
 * shows the avatar and «Профиль», and its root screen starts with the profile row.
 */
export const PROFILE_TAB: Record<Zone, TabId> = { trainer: "more", client: "trainers" };

/** Tab label in the current language. Trainer and client tab ids never overlap. */
export function tabLabel(t: Dictionary, id: TabId): string {
  const labels: Record<TabId, string> = { ...t.tabs.trainer, ...t.tabs.client };
  return labels[id];
}

/** A section of the trainer's «Ещё»: a row on /trainer/more, an item of the side menu from 768px. */
export type MoreItem = {
  /** First path segment under /trainer: the side menu marks the item while one of its screens is open. */
  segment: string;
  href: string;
  icon: LucideIcon;
  title: (t: Dictionary) => string;
  subtitle: (t: Dictionary) => string;
  /** QR и ссылка stands out in the accent color, as the way clients come in. */
  accent?: boolean;
};

/** The trainer's «Ещё» in order; the side menu shows as many as fit and keeps the rest under «Ещё». */
export const TRAINER_MORE_ITEMS: readonly MoreItem[] = [
  { segment: "profile", href: "/trainer/profile", icon: UserRound, title: (t) => t.trainerWizard.edit.open, subtitle: (t) => t.trainerWizard.edit.openText },
  { segment: "links", href: "/trainer/links", icon: QrCode, accent: true, title: (t) => t.screens.trainer.more.links, subtitle: (t) => t.screens.trainer.more.linksText },
  { segment: "showcase", href: "/trainer/showcase", icon: Store, title: (t) => t.screens.trainer.more.showcase, subtitle: (t) => t.screens.trainer.more.showcaseText },
  { segment: "milestones", href: "/trainer/milestones", icon: Award, title: (t) => t.trainerMilestones.title, subtitle: (t) => t.trainerMilestones.moreText },
  { segment: "reviews", href: "/trainer/reviews", icon: Star, title: (t) => t.reviews.trainer.title, subtitle: (t) => t.reviews.trainer.moreText },
  { segment: "exercises", href: "/trainer/exercises", icon: Dumbbell, title: (t) => t.screens.trainer.more.exercises, subtitle: (t) => t.screens.trainer.more.exercisesText },
  { segment: "templates", href: "/trainer/templates", icon: ClipboardList, title: (t) => t.screens.trainer.more.templates, subtitle: (t) => t.screens.trainer.more.templatesText },
  { segment: "challenges", href: "/trainer/challenges", icon: Trophy, title: (t) => t.challenges.title, subtitle: (t) => t.challenges.all.moreText },
  { segment: "groups", href: "/trainer/groups", icon: Users, title: (t) => t.screens.trainer.more.groups, subtitle: (t) => t.screens.trainer.more.groupsText },
  { segment: "team", href: "/trainer/team", icon: Handshake, title: (t) => t.screens.trainer.more.team, subtitle: (t) => t.screens.trainer.more.teamText },
  { segment: "analytics", href: "/trainer/analytics", icon: ChartColumn, title: (t) => t.screens.trainer.more.analytics, subtitle: (t) => t.screens.trainer.more.analyticsText },
  { segment: "nutrition", href: "/trainer/nutrition", icon: Salad, title: (t) => t.adherence.title, subtitle: (t) => t.adherence.moreText },
  { segment: "checkin-qr", href: "/trainer/checkin-qr", icon: ScanLine, title: (t) => t.checkIn.placesTitle, subtitle: (t) => t.checkIn.placesRowText },
  { segment: "referrals", href: "/trainer/referrals", icon: Gift, title: (t) => t.referrals.title, subtitle: (t) => t.referrals.moreText },
  { segment: "invite-trainers", href: "/trainer/invite-trainers", icon: UserPlus, title: (t) => t.trainerReferrals.title, subtitle: (t) => t.trainerReferrals.moreText },
];

/** Help closes the «Ещё» list in its own group. */
export const TRAINER_HELP_ITEM: MoreItem = { segment: "help", href: helpPath("trainer"), icon: CircleHelp, title: (t) => t.help.title, subtitle: (t) => t.help.moreText };
