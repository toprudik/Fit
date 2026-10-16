"use client";

import { ArrowDown, ArrowUp, Flame, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { localDay } from "@/lib/passes/present";
import { cn } from "@/lib/utils";
import {
  draftPayload,
  emptySet,
  LOG_NOTES_MAX_LENGTH,
  MAX_EXERCISES,
  MAX_SETS,
  nextSet,
  performedAtFor,
  TITLE_MAX_LENGTH,
  type DraftError,
  type ExerciseDraft,
  type LogDraft,
  type SetDraft,
} from "@/lib/workouts/log";
import { findExercises, lastResults, saveWorkoutLog, type ExerciseHit, type LastResult } from "@/lib/workouts/log-actions";
import { formatLogDay, formatSet } from "@/lib/workouts/present";
import { weightUnit } from "@/lib/workouts/units";

type LogEditorProps = {
  clientId: string;
  coachingId?: string;
  bookingId?: string;
  /** Editing a saved log: its id and when it happened, kept while the date stays the same. */
  log?: { id: string; performedAt: string; templateId?: string };
  /** A log for a booked session happened when the session started. */
  sessionStart?: string;
  /** The viewer's zone, for the day of a new date. */
  timeZone: string;
  initial: LogDraft;
  /** After saving, the log opens at `${hrefBase}/${id}`. */
  hrefBase: string;
};

let keySeed = 0;
const newKey = () => `x${++keySeed}`;

/**
 * Writes or edits a workout log (PRD wave-1 §2.10-4, 2.10-5, WORK-3): exercises from the library, sets of
 * reps, weight and time, and for each exercise what the client did last time. Saves the whole log at once.
 */
export function LogEditor({ clientId, coachingId, bookingId, log, sessionStart, timeZone, initial, hrefBase }: LogEditorProps) {
  const { t, locale } = useI18n();
  const copy = t.workouts.editor;
  const unit = weightUnit(locale);
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<DraftError[]>([]);
  const [picking, setPicking] = useState(false);
  const [last, setLast] = useState<Record<string, LastResult | null>>({});
  const [pending, startTransition] = useTransition();
  const before = log?.performedAt ?? sessionStart;

  // "В прошлый раз" for exercises not looked up yet (WORK-3): one request per change of the list.
  const missing = draft.exercises.map((e) => e.exerciseId).filter((id, i, all) => !(id in last) && all.indexOf(id) === i);
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    const ids = missingKey.split(",");
    let current = true;
    lastResults({ clientId, exerciseIds: ids, before }).then((results) => {
      if (!current) return;
      setLast((known) => {
        const next = { ...known };
        for (const id of ids) next[id] = results.find((r) => r.exerciseId === id) ?? null;
        return next;
      });
    });
    return () => {
      current = false;
    };
  }, [missingKey, clientId, before]);

  const update = (index: number, change: (exercise: ExerciseDraft) => ExerciseDraft) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e, i) => (i === index ? change(e) : e)) }));
  const updateSet = (index: number, set: number, change: Partial<SetDraft>) =>
    update(index, (e) => ({ ...e, sets: e.sets.map((s, i) => (i === set ? { ...s, ...change } : s)) }));
  const move = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      const exercises = [...d.exercises];
      [exercises[index], exercises[index + by]] = [exercises[index + by], exercises[index]];
      return { ...d, exercises };
    });

  function add(hit: ExerciseHit) {
    setDraft((d) => ({
      ...d,
      exercises: [...d.exercises, { key: newKey(), exerciseId: hit.id, name: hit.name, notes: "", sets: [emptySet()] }],
    }));
    setErrors((e) => e.filter((error) => error.kind !== "empty"));
    setPicking(false);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const keep = log?.performedAt ?? sessionStart;
    const performedAt = keep && draft.date === initial.date ? keep : performedAtFor(draft.date, timeZone);
    const result = draftPayload(draft, unit, {
      id: log?.id,
      clientId,
      coachingId,
      bookingId,
      templateId: log?.templateId,
      performedAt,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    startTransition(async () => {
      const saved = await saveWorkoutLog(result.payload);
      if (saved.ok) {
        toast.success(copy.saved);
        router.push(`${hrefBase}/${saved.id}`);
      } else {
        toast.error(saved.reason === "forbidden" ? copy.forbidden : copy.failed);
      }
    });
  }

  const has = (kind: DraftError["kind"]) => errors.some((e) => e.kind === kind);
  const setError = (exercise: number, set: number) => errors.some((e) => e.kind === "set" && e.exercise === exercise && e.set === set);

  return (
    <form onSubmit={save} noValidate className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
      <TextField
        label={copy.title}
        placeholder={copy.titlePlaceholder}
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        maxLength={TITLE_MAX_LENGTH}
        autoComplete="off"
        error={has("title") ? copy.errors.title : undefined}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={copy.date}
          type="date"
          value={draft.date}
          onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
          required
          error={has("date") ? copy.errors.date : undefined}
        />
        <TextField
          label={copy.duration}
          inputMode="numeric"
          suffix={copy.minutes}
          value={draft.durationMin}
          onChange={(e) => setDraft((d) => ({ ...d, durationMin: e.target.value }))}
          maxLength={3}
          autoComplete="off"
          error={has("duration") ? copy.errors.duration : undefined}
        />
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="log-exercises">
        <h2 id="log-exercises" className="px-1 text-headline">
          {copy.exercises}
        </h2>
        {draft.exercises.map((exercise, index) => (
          <ExerciseBlock
            key={exercise.key}
            timeZone={timeZone}
            exercise={exercise}
            index={index}
            count={draft.exercises.length}
            last={last[exercise.exerciseId]}
            setError={(set) => setError(index, set)}
            onSet={(set, change) => updateSet(index, set, change)}
            onAddSet={() => update(index, (e) => ({ ...e, sets: [...e.sets, nextSet(e.sets)] }))}
            onRemoveSet={(set) => update(index, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== set) }))}
            onNotes={(notes) => update(index, (e) => ({ ...e, notes }))}
            onMove={(by) => move(index, by)}
            onRemove={() => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== index) }))}
          />
        ))}
        {has("empty") ? <p className="px-1 text-footnote text-danger">{copy.errors.empty}</p> : null}
        {draft.exercises.length < MAX_EXERCISES ? (
          <Button type="button" variant="secondary" icon={Plus} onClick={() => setPicking(true)} block>
            {copy.addExercise}
          </Button>
        ) : null}
      </section>

      <TextArea
        label={copy.notes}
        value={draft.notes}
        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        maxLength={LOG_NOTES_MAX_LENGTH}
        rows={3}
      />
      <Button type="submit" loading={pending} block>
        {copy.save}
      </Button>
      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={add} />
    </form>
  );
}

function ExerciseBlock({
  timeZone,
  exercise,
  index,
  count,
  last,
  setError,
  onSet,
  onAddSet,
  onRemoveSet,
  onNotes,
  onMove,
  onRemove,
}: {
  timeZone: string;
  exercise: ExerciseDraft;
  index: number;
  count: number;
  last: LastResult | null | undefined;
  setError: (set: number) => boolean;
  onSet: (set: number, change: Partial<SetDraft>) => void;
  onAddSet: () => void;
  onRemoveSet: (set: number) => void;
  onNotes: (notes: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.workouts.editor;
  const unit = weightUnit(locale);
  const headingId = `exercise-${exercise.key}`;
  const lastLine =
    last === undefined
      ? null
      : last === null
        ? copy.noLast
        : interpolate(copy.last, {
            date: formatLogDay(locale, localDay(last.performedAt, timeZone)),
            sets: last.sets.map((s) => formatSet(t, locale, s, unit)).join(", "),
          });
  const anySetError = exercise.sets.some((_, set) => setError(set));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-2.5">
          <h3 id={headingId} className="text-headline">
            {exercise.name}
          </h3>
          {lastLine ? <p className="text-footnote text-ink-2">{lastLine}</p> : null}
        </div>
        <IconButton icon={ArrowUp} label={`${copy.moveUp}: ${exercise.name}`} disabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton
          icon={ArrowDown}
          label={`${copy.moveDown}: ${exercise.name}`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        />
        <IconButton icon={X} label={`${copy.remove}: ${exercise.name}`} onClick={onRemove} />
      </div>
      {exercise.sets.length ? (
        <div role="table" aria-labelledby={headingId} className="flex flex-col gap-2">
          <div role="row" className="grid grid-cols-[1.25rem_1fr_1fr_1fr_2.75rem_2.75rem] items-end gap-2 text-footnote text-ink-2">
            <span role="columnheader" className="sr-only">
              {interpolate(copy.set, { n: "" }).trim()}
            </span>
            <span aria-hidden />
            <span role="columnheader">{copy.reps}</span>
            <span role="columnheader">{interpolate(copy.weight, { unit: t.workouts.sets.units[unit] })}</span>
            <span role="columnheader">{copy.time}</span>
            <span role="columnheader" className="grid place-items-center">
              <Flame aria-hidden size={18} />
              <span className="sr-only">{copy.warmup}</span>
            </span>
            <span aria-hidden />
          </div>
          {exercise.sets.map((set, n) => {
            const label = interpolate(copy.set, { n: n + 1 });
            const invalid = setError(n);
            return (
              <div role="row" key={n} className="grid grid-cols-[1.25rem_1fr_1fr_1fr_2.75rem_2.75rem] items-center gap-2">
                <span role="rowheader" className="text-footnote text-ink-2 tabular-nums">
                  <span aria-hidden>{n + 1}</span>
                  <span className="sr-only">{label}</span>
                </span>
                <SetInput
                  label={`${label}, ${copy.reps}`}
                  inputMode="numeric"
                  value={set.reps}
                  invalid={invalid}
                  onChange={(reps) => onSet(n, { reps })}
                />
                <SetInput
                  label={`${label}, ${interpolate(copy.weight, { unit: t.workouts.sets.units[unit] })}`}
                  inputMode="decimal"
                  value={set.weight}
                  invalid={invalid}
                  onChange={(weight) => onSet(n, { weight })}
                />
                <SetInput
                  label={`${label}, ${copy.time}`}
                  inputMode="text"
                  value={set.duration}
                  invalid={invalid}
                  onChange={(duration) => onSet(n, { duration })}
                />
                <span role="cell" className="grid size-11 place-items-center">
                  <input
                    type="checkbox"
                    aria-label={`${label}, ${copy.warmup}`}
                    checked={set.warmup}
                    onChange={(e) => onSet(n, { warmup: e.target.checked })}
                    className="size-5 cursor-pointer accent-[var(--accent)]"
                  />
                </span>
                <span role="cell">
                  <IconButton icon={Trash2} label={interpolate(copy.removeSet, { n: n + 1 })} onClick={() => onRemoveSet(n)} />
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {anySetError ? <p className="text-footnote text-danger">{copy.errors.set}</p> : null}
      {exercise.sets.length < MAX_SETS ? (
        <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={onAddSet} className="self-start">
          {copy.addSet}
        </Button>
      ) : null}
      <TextField
        label={copy.exerciseNotes}
        value={exercise.notes}
        onChange={(e) => onNotes(e.target.value)}
        maxLength={1000}
        autoComplete="off"
      />
    </section>
  );
}

function SetInput({
  label,
  value,
  invalid,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  inputMode: "numeric" | "decimal" | "text";
}) {
  return (
    <span role="cell" className="min-w-0">
      <input
        aria-label={label}
        aria-invalid={invalid && value.trim() !== "" ? true : undefined}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={8}
        autoComplete="off"
        className={cn(
          "h-11 w-full min-w-0 rounded-sm border bg-field px-1 text-center text-body text-ink tabular-nums outline-none",
          "focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)]",
          invalid ? "border-danger" : "border-field-line",
        )}
      />
    </span>
  );
}

/** "Выбери упражнение": the library search in a sheet (PRD 2.10-1..3). */
function ExercisePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (hit: ExerciseHit) => void;
}) {
  const { t, locale } = useI18n();
  const copy = t.workouts.editor;
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ExerciseHit[] | null>(null);
  const request = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++request.current;
    const timer = setTimeout(
      () => {
        findExercises({ query: query.trim(), locale }).then((found) => {
          if (request.current === id) setHits(found);
        });
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [open, query, locale]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={copy.pickTitle}>
      <div className="flex flex-col gap-4 pb-2">
        <TextField
          label={copy.search}
          type="search"
          placeholder={copy.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          enterKeyHint="search"
        />
        {hits === null ? (
          <div role="status" className="flex items-center justify-center gap-2 py-6 text-subhead text-ink-2">
            <Spinner />
            {copy.searching}
          </div>
        ) : hits.length === 0 ? (
          <p className="flex items-center gap-2 px-1 py-4 text-subhead text-ink-2">
            <Search aria-hidden size={18} />
            {copy.nothing}
          </p>
        ) : (
          <ListGroup surface="raised" headingLevel={3}>
            {hits.map((hit) => (
              <ListRow
                key={hit.id}
                title={hit.name}
                subtitle={hit.category ? t.workouts.categories[hit.category as keyof typeof t.workouts.categories] : undefined}
                onClick={() => onPick(hit)}
                chevron={false}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </Sheet>
  );
}
