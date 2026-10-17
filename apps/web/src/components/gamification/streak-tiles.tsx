import { Flame, Footprints, Utensils } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { interpolate, plural } from "@/i18n/format";
import type { Streaks } from "@/lib/gamification/gamification";

function Tile({ icon: Icon, label, value, note }: { icon: typeof Flame; label: string; value: string; note?: string }) {
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-1 p-3">
      <span className="flex items-center gap-1.5 text-footnote text-ink-2">
        <Icon aria-hidden size={16} strokeWidth={1.75} />
        {label}
      </span>
      <span className="text-headline tabular-nums">{value}</span>
      {note ? <span className="text-caption text-ink-2">{note}</span> : null}
    </li>
  );
}

/** The client's streaks as tiles: workouts in weeks with this week's progress, diary and steps in days (§2.1). */
export function StreakTiles({ t, locale, streaks }: { t: Dictionary; locale: Locale; streaks: Streaks }) {
  const copy = t.gamification.streaks;
  const week =
    streaks.weekDone >= streaks.weekGoal
      ? copy.weekDone
      : interpolate(copy.week, { done: streaks.weekDone, goal: streaks.weekGoal });
  return (
    <ul aria-label={copy.header} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Tile icon={Flame} label={copy.workouts} value={plural(locale, streaks.workouts, copy.weeks)} note={week} />
      {streaks.diary !== null ? <Tile icon={Utensils} label={copy.diary} value={plural(locale, streaks.diary, copy.days)} /> : null}
      {streaks.steps !== null ? <Tile icon={Footprints} label={copy.steps} value={plural(locale, streaks.steps, copy.days)} /> : null}
    </ul>
  );
}
