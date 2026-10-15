import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Server-safe layout pieces of a zone screen. Screen paddings follow brand.md "Сетка": 16px on a
 * phone, 24px on a tablet, 32px on a desktop.
 */

type ScreenProps = {
  /** Usually a `ScreenHeader`, which must be the first child of the column for its bar to stick. */
  header: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

/**
 * Page column of a screen. At least one viewport tall above the tab bar, so a screen with little
 * content still fills it. Content starts at the top: an empty state sits `space-10` under the header.
 */
export function Screen({ header, children, className }: ScreenProps) {
  return (
    <div
      data-slot="screen"
      className={cn(
        "flex min-h-[calc(100dvh-var(--size-tabbar)-var(--safe-bottom))] flex-col px-4 pb-8 md:min-h-dvh md:px-6 xl:px-8",
        className,
      )}
    >
      {header}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

// From 1280px the 320px list column gets phone-like 16px paddings, and the screen title stays on top
// of the list while it scrolls (desktop-clients.png).
const LIST_COLUMN = [
  "xl:*:data-[slot=screen]:px-4",
  "xl:**:data-[slot=screen-title]:sticky xl:**:data-[slot=screen-title]:top-0 xl:**:data-[slot=screen-title]:z-[var(--z-header)]",
  "xl:**:data-[slot=screen-title]:-mx-4 xl:**:data-[slot=screen-title]:bg-bg xl:**:data-[slot=screen-title]:px-4",
];

type MasterDetailProps = {
  /** The list screen, usually a `Screen`. */
  list: React.ReactNode;
  /** What the list item opens; a `DetailPlaceholder` until one is chosen. */
  detail: React.ReactNode;
};

/**
 * List on the left, the open item on the right (screens.md §1.1). Below 1280px only the list shows
 * and items open as pushed screens. From 1280px the columns are 320px and the rest, and each scrolls
 * on its own.
 */
export function MasterDetail({ list, detail }: MasterDetailProps) {
  return (
    <div className="xl:grid xl:h-dvh xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* data-scroll-column: tapping the current tab again scrolls these to the top too (AppShell). */}
      <div
        data-scroll-column
        className={cn("xl:h-dvh xl:overflow-y-auto xl:overscroll-contain xl:border-r xl:border-line", LIST_COLUMN)}
      >
        {list}
      </div>
      <div data-scroll-column className="hidden xl:block xl:h-dvh xl:overflow-y-auto xl:overscroll-contain">
        {detail}
      </div>
    </div>
  );
}

type DetailPlaceholderProps = {
  icon: LucideIcon;
  /** What will open here, e.g. "Здесь откроется карточка клиента". */
  text: string;
};

/**
 * The detail column before anything is chosen in the list. It lines up with the list's empty state:
 * its 64px icon box starts where the empty state's tile does, below the desktop title row (space-6,
 * a title-1 line, space-6, see ScreenHeader) and the empty state's own space-10.
 */
export function DetailPlaceholder({ icon: Icon, text }: DetailPlaceholderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 px-8 text-center",
        "pt-[calc(var(--space-6)+var(--text-title-1--line-height)+var(--space-6)+var(--space-10))]",
      )}
    >
      <div aria-hidden className="mb-1 grid size-16 place-items-center text-ink-3">
        <Icon size={32} strokeWidth={1.75} />
      </div>
      <p className="max-w-[300px] text-callout text-ink-2">{text}</p>
    </div>
  );
}
