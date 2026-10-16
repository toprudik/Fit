import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "bg-surface-3 text-ink",
  accent: "bg-accent-soft text-accent-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  // Plan badges: Pro is blue, Premium gold (tokens pro and premium).
  pro: "bg-pro-soft text-pro",
  premium: "bg-premium-soft text-premium",
} as const;

type BadgeProps = {
  tone?: keyof typeof TONES;
  icon?: LucideIcon;
  /** One or two words; the color always comes with the word. */
  children: React.ReactNode;
  className?: string;
};

/** Short status or plan label next to a title (docs/design/components/Badge). */
export function Badge({ tone = "neutral", icon: Icon, children, className }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-xs px-2 text-caption font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden size={12} strokeWidth={2.25} /> : null}
      {children}
    </span>
  );
}
