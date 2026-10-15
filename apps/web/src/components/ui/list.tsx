import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PersonAvatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type ListGroupProps = {
  /** Plain-case caption above the group (no caps). */
  header?: string;
  /** Explanation under the group. */
  footer?: React.ReactNode;
  /** h2 on a screen under its h1; h3 inside a titled section or sheet. */
  headingLevel?: 2 | 3;
  /** `raised` puts the group on surface-2, for a group inside a sheet or card that is surface-1 itself. */
  surface?: "default" | "raised";
  children: React.ReactNode;
  className?: string;
};

/**
 * Grouped list on `surface-1` (docs/design/components/ListGroup): settings, a client card, a
 * schedule. The group is the card, so don't put cards inside it.
 */
function ListGroup({ header, footer, headingLevel = 2, surface = "default", children, className }: ListGroupProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <section data-slot="list-group" className={cn("flex flex-col gap-1.5", className)}>
      {header ? <Heading className="px-4 text-footnote text-ink-2">{header}</Heading> : null}
      {/* overflow-hidden rounds the pressed rows and clips the first row's separator (see ListRow). */}
      <div
        data-surface={surface}
        className={cn("group/list overflow-hidden rounded-lg", surface === "raised" ? "bg-surface-2" : "bg-surface-1")}
      >
        {children}
      </div>
      {footer ? <div className="px-4 text-footnote text-ink-2">{footer}</div> : null}
    </section>
  );
}

type ListRowProps = {
  icon?: LucideIcon;
  /** `accent` gives the blue tile of the main item. */
  iconTone?: "default" | "accent";
  /** A person: 40 px avatar instead of the icon. */
  avatar?: { name: string; src?: string | null };
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Value on the right in `ink-2` with tabular figures, never blue. */
  value?: React.ReactNode;
  /** Custom content before the text. */
  leading?: React.ReactNode;
  /** Custom content after the value, e.g. a switch or a badge. */
  trailing?: React.ReactNode;
  /** Navigates with `next/link`. */
  href?: string;
  /** Acts as a button; with `href`, runs before the navigation (e.g. to close a sheet). */
  onClick?: () => void;
  /** Defaults to shown when the row leads somewhere (`href` or `onClick`). */
  chevron?: boolean;
  /** `danger` for a destructive action such as signing out. */
  tone?: "default" | "danger";
  className?: string;
};

/**
 * List row (docs/design/components/ListRow): icon or avatar, title, subtitle and value. With `href`
 * or `onClick` the whole row is pressable and gets a chevron. At least 52 px tall.
 */
function ListRow({
  icon: Icon,
  iconTone = "default",
  avatar,
  title,
  subtitle,
  value,
  leading,
  trailing,
  href,
  onClick,
  chevron,
  tone = "default",
  className,
}: ListRowProps) {
  const pressable = href !== undefined || onClick !== undefined;
  const showChevron = chevron ?? pressable;

  const classes = cn(
    "relative flex min-h-13 w-full items-center gap-3 px-4 py-3 text-left",
    // Separator: 1px line drawn just above the row, starting under the text. The group clips the
    // first row's line, so this works even when rows are wrapped (a form, a fragment).
    "before:pointer-events-none before:absolute before:-top-px before:right-0 before:h-px before:bg-line",
    // Text start: padding 16 + avatar 40 / tile 30 + gap 12.
    avatar ? "before:left-17" : Icon || leading ? "before:left-[58px]" : "before:left-4",
    pressable && [
      "cursor-pointer transition-[background-color] duration-[var(--duration-instant)] hover:bg-surface-3 active:bg-surface-3",
      // Inset focus ring: the group's overflow would clip one drawn outside the row.
      "focus-visible:-outline-offset-2 motion-reduce:transition-none",
    ],
    className,
  );

  const content = (
    <>
      {Icon ? (
        <span
          aria-hidden
          className={cn(
            "grid size-7.5 shrink-0 place-items-center rounded-xs",
            iconTone === "accent" ? "bg-accent text-on-accent" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-3 text-ink",
          )}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
      ) : null}
      {avatar ? <PersonAvatar name={avatar.name} src={avatar.src} size={40} decorative /> : null}
      {leading}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-body leading-[22px]", tone === "danger" && "text-danger")}>{title}</span>
        {subtitle ? <span className="truncate text-subhead text-ink-2">{subtitle}</span> : null}
      </span>
      {value !== undefined && value !== null ? (
        <span className="shrink-0 text-body leading-[22px] whitespace-nowrap text-ink-2 tabular-nums">{value}</span>
      ) : null}
      {trailing}
      {showChevron ? (
        // ink-3 is meant for bg and surface-1 only; on a raised (surface-2) group the chevron takes ink-2.
        <ChevronRight aria-hidden size={20} strokeWidth={1.75} className="shrink-0 text-ink-3 group-data-[surface=raised]/list:text-ink-2" />
      ) : null}
    </>
  );

  if (href !== undefined) {
    return (
      <Link data-slot="list-row" href={href} onClick={onClick} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button data-slot="list-row" type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return (
    <div data-slot="list-row" className={classes}>
      {content}
    </div>
  );
}

export { ListGroup, ListRow };
