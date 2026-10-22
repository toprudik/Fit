import type { TabId } from "@/lib/navigation/zones";
import { Skeleton, SkeletonChips, SkeletonEmpty, SkeletonRows, SkeletonScreen, SkeletonSegments } from "@/components/ui/skeleton";

/*
 * The loading screens of the tab roots, shaped like the screens they stand for (screens.md §1.3). A
 * page uses its own as the Suspense fallback; the shell (AppShell) shows the same one under the tab's
 * title when a tapped tab's screen has not arrived after 300 ms, so the two hand over in place.
 * Server-safe: no hooks, no "use client".
 */

type SkeletonProps = { label: string };

/** «Главная» of the client: the next session, the passes, today's goals. */
export function ClientHomeSkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label}>
      <SkeletonRows header rows={1} />
      <SkeletonRows header rows={2} />
      <SkeletonRows header rows={2} />
    </SkeletonScreen>
  );
}

/** «Занятия» of the client: the booking button, the segments and the list. */
export function ClientSessionsSkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label}>
      <Skeleton className="h-11 w-36 rounded-full" />
      <SkeletonSegments />
      <SkeletonRows rows={2} />
    </SkeletonScreen>
  );
}

/** The workout logs of «Дневник», under its food and activity rows. */
export function ClientDiarySkeleton({ label }: SkeletonProps) {
  return <SkeletonRows rows={2} label={label} />;
}

/** «Замеры» on «Прогресс»: drawn like its empty state, which a new client sees. */
export function MeasurementsSkeleton({ label }: Partial<SkeletonProps>) {
  return <SkeletonEmpty label={label} />;
}

/** The «Цель и норма питания» row on «Прогресс». */
export function NutritionEntrySkeleton({ label }: Partial<SkeletonProps>) {
  return <SkeletonRows rows={1} label={label} />;
}

/** «Фото» on «Прогресс»: drawn like its empty state. */
export function PhotosSkeleton({ label }: Partial<SkeletonProps>) {
  return <SkeletonEmpty label={label} />;
}

/** The health part of «Прогресс» while its consent is checked: measurements, the nutrition row, photos. */
export function ProgressHealthSkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label} className="gap-6">
      <MeasurementsSkeleton />
      <NutritionEntrySkeleton />
      <PhotosSkeleton />
    </SkeletonScreen>
  );
}

/** «Серии и значки» on «Прогресс»: the caption, three streak tiles and the badges row. */
export function GamificationSkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label} className="gap-3">
      <Skeleton className="mx-4 my-0.5 h-3 w-28" />
      <div aria-hidden className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Skeleton className="h-21 rounded-lg bg-surface-1" />
        <Skeleton className="h-21 rounded-lg bg-surface-1" />
        <Skeleton className="h-17 rounded-lg bg-surface-1" />
      </div>
      <SkeletonRows rows={1} />
    </SkeletonScreen>
  );
}

/** «Сегодня» of the trainer. */
export function TrainerTodaySkeleton({ label }: SkeletonProps) {
  return <SkeletonRows header rows={2} label={label} />;
}

/** «Расписание»: the week line, the filters, the days strip on a phone and the day's sessions. */
export function TrainerScheduleSkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label}>
      <Skeleton className="h-6 w-48" />
      <SkeletonChips widths={["6.5rem", "5.5rem", "8.5rem", "4.5rem"]} />
      <div aria-hidden className="grid grid-cols-7 gap-1.5 md:hidden">
        {Array.from({ length: 7 }, (_, day) => (
          <Skeleton key={day} className="h-14 rounded-sm" />
        ))}
      </div>
      <SkeletonRows header leading="none" rows={2} />
    </SkeletonScreen>
  );
}

/** «Клиенты»: the search, the filters and the list of people. */
export function TrainerClientsSkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label} className="pt-4 md:pt-0">
      <Skeleton className="h-11 rounded-md" />
      <SkeletonChips widths={["4.5rem", "6.5rem", "8rem", "5rem"]} />
      <SkeletonRows leading="avatar" rows={3} />
    </SkeletonScreen>
  );
}

/** «Деньги»: the month's income card as it is without payments, the segments and a list. */
export function TrainerMoneySkeleton({ label }: SkeletonProps) {
  return (
    <SkeletonScreen label={label}>
      {/* The card of MoneyOverview: a footnote line and a body line, 78px like the real one. */}
      <div aria-hidden className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4">
        <span className="flex h-4.5 items-center">
          <Skeleton className="h-3 w-40" />
        </span>
        <span className="flex h-6 items-center">
          <Skeleton className="h-3.5 w-56" />
        </span>
      </div>
      <SkeletonSegments selected={1} />
      <SkeletonRows header rows={1} />
    </SkeletonScreen>
  );
}

/** What the shell shows under a tab's title while its screen is on the way. */
type PendingSkeleton = {
  /** The page's own column around its content, so the page's fallback lands in the same place. */
  column?: string;
  /** Static parts of the page above or around the fallback, drawn as skeletons too. */
  render: (label: string) => React.ReactNode;
};

const COLUMN = "flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0";

/** Per tab: the loading screen the shell shows while that tab's screen is on its way. */
export const PENDING_SKELETONS: Record<TabId, PendingSkeleton> = {
  home: { render: (label) => <ClientHomeSkeleton label={label} /> },
  sessions: { render: (label) => <ClientSessionsSkeleton label={label} /> },
  diary: {
    column: COLUMN,
    render: (label) => (
      <>
        <SkeletonRows rows={1} />
        <SkeletonRows rows={1} />
        <ClientDiarySkeleton label={label} />
      </>
    ),
  },
  progress: {
    column: COLUMN,
    render: (label) => (
      <>
        <ProgressHealthSkeleton label={label} />
        <GamificationSkeleton label={label} />
      </>
    ),
  },
  trainers: { column: "pt-4 md:pt-0", render: (label) => <SkeletonRows rows={3} label={label} /> },
  today: { render: (label) => <TrainerTodaySkeleton label={label} /> },
  schedule: { column: "flex w-full flex-col pt-4 md:pt-0", render: (label) => <TrainerScheduleSkeleton label={label} /> },
  clients: { render: (label) => <TrainerClientsSkeleton label={label} /> },
  money: {
    column: "flex flex-col gap-6 pt-4 md:pt-0",
    render: (label) => (
      <>
        <TrainerMoneySkeleton label={label} />
        <SkeletonRows rows={1} />
      </>
    ),
  },
  more: { column: "pt-4 md:pt-0", render: (label) => <SkeletonRows rows={3} label={label} /> },
};
