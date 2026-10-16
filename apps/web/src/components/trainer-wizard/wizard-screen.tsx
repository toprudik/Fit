import { DaMark } from "@/components/brand/da-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { getDictionary } from "@/i18n/server";
import { WizardBack } from "./wizard-back";

type WizardScreenProps = {
  /** "Шаг 2 из 7" above the bar; the result screen has none. */
  stepLabel?: string;
  /** Filled part of the bar, 0 to 1. */
  progress: number;
  progressLabel: string;
  back?: string | null;
  title: string;
  text?: string;
  children: React.ReactNode;
};

/**
 * One wizard screen: back, progress bar, title and the step's form, in the same narrow column as
 * the invite screen. No app shell: the trainer is still on the way in.
 */
export function WizardScreen({ stepLabel, progress, progressLabel, back, title, text, children }: WizardScreenProps) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 100);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-6 px-4 pt-[max(var(--safe-top),var(--space-4))] pb-[max(var(--safe-bottom),var(--space-6))]">
      <div className="flex flex-col gap-3">
        <div className="flex h-11 items-center gap-2">
          {back ? <WizardBack href={back} /> : <DaMark className="size-8" />}
          {stepLabel ? <p className="ml-auto text-footnote text-ink-2 tabular-nums">{stepLabel}</p> : null}
        </div>
        <div
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1 overflow-hidden rounded-full bg-surface-3"
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-large-title">{title}</h1>
        {text ? <p className="text-callout text-ink-2">{text}</p> : null}
      </div>
      {children}
    </main>
  );
}

/** What a wizard screen looks like while the session and the saved answers load. */
export async function WizardSkeleton() {
  const t = await getDictionary();
  return (
    <main
      role="status"
      aria-label={t.common.loading}
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-6 px-4 pt-[max(var(--safe-top),var(--space-4))] pb-[max(var(--safe-bottom),var(--space-6))]"
    >
      <div className="flex flex-col gap-3">
        <div className="h-11" />
        <div className="h-1 rounded-full bg-surface-3" />
      </div>
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-13 w-full" />
      <Skeleton className="h-13 w-full" />
    </main>
  );
}
