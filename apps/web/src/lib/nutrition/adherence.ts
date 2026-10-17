/** Adherence periods of the trainer's "Питание" list and the pair's tab (wave-2 §5.3). */
export const ADHERENCE_PERIODS = [7, 30, 90] as const;
export type AdherencePeriod = (typeof ADHERENCE_PERIODS)[number];

export const isAdherencePeriod = (value: unknown): value is AdherencePeriod =>
  (ADHERENCE_PERIODS as readonly unknown[]).includes(Number(value)) && String(Number(value)) === String(value);

/** One client's adherence over a period: days in the norm out of logged days with a target. */
export type Adherence = {
  days: AdherencePeriod;
  logged: number;
  counted: number;
  inNorm: number;
  /** Percent, rounded; null when no logged day had a target. */
  share: number | null;
  /** The same for the period before, for the trend. */
  previous: number | null;
  hasTarget: boolean;
};

export type AdherenceRow = {
  days: number;
  logged: number;
  counted: number;
  in_norm: number;
  adherence: number | null;
  previous_adherence: number | null;
  has_target: boolean;
};

export function toAdherence(row: AdherenceRow, days: AdherencePeriod): Adherence {
  return {
    days,
    logged: row.logged,
    counted: row.counted,
    inNorm: row.in_norm,
    share: row.adherence,
    previous: row.previous_adherence,
    hasTarget: row.has_target,
  };
}

/** Points of change that read as a trend; smaller moves are noise on a week of a few days. */
const TREND_STEP = 5;

export function trendOf(adherence: Pick<Adherence, "share" | "previous">): "up" | "down" | "flat" | null {
  if (adherence.share === null || adherence.previous === null) return null;
  const change = adherence.share - adherence.previous;
  if (change >= TREND_STEP) return "up";
  if (change <= -TREND_STEP) return "down";
  return "flat";
}

/**
 * The list order (§5.5): clients with a percentage first, lowest first, since those need the trainer; then those
 * with a target but no judged day; then those without a target. Names break ties.
 */
export function byAdherence<T extends { name: string; adherence: Adherence }>(rows: T[], collator: Intl.Collator): T[] {
  const rank = (row: T) => (row.adherence.share !== null ? 0 : row.adherence.hasTarget ? 1 : 2);
  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.adherence.share ?? 0) - (b.adherence.share ?? 0) ||
      collator.compare(a.name, b.name),
  );
}
