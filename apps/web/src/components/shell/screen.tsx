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

/** Page column of a zone screen. At least one viewport tall above the tab bar, so short content can center. */
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

/** The detail column before anything is chosen in the list. */
export function DetailPlaceholder({ icon: Icon, text }: DetailPlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <Icon aria-hidden size={32} strokeWidth={1.75} className="text-ink-3" />
      <p className="max-w-[300px] text-callout text-ink-2">{text}</p>
    </div>
  );
}
