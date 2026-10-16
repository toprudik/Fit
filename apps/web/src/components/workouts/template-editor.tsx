"use client";

import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { MAX_EXERCISES } from "@/lib/workouts/log";
import type { ExerciseHit } from "@/lib/workouts/log-actions";
import {
  TEMPLATE_NOTES_MAX_LENGTH,
  TEMPLATE_TITLE_MAX_LENGTH,
  templatePayload,
  type TemplateDraft,
  type TemplateDraftError,
  type TemplateItemDraft,
} from "@/lib/workouts/template";
import { saveWorkoutTemplate, setTemplateArchived } from "@/lib/workouts/template-actions";
import { weightUnit } from "@/lib/workouts/units";
import { ExercisePicker, SetInput } from "./log-editor";

let keySeed = 0;
const newKey = () => `t${++keySeed}`;

const TARGETS = ["sets", "reps", "weight", "duration", "rest"] as const;

/**
 * Builds or edits a workout template (PRD wave-1 §2.10-7): exercises from the library with a plan of sets,
 * reps, weight, time and rest. A log filled from it is a copy; editing the log leaves the template alone (WORK-5).
 */
export function TemplateEditor({ id, initial }: { id?: string; initial: TemplateDraft }) {
  const { t, locale } = useI18n();
  const copy = t.workouts.templates;
  const unit = weightUnit(locale);
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<TemplateDraftError[]>([]);
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (index: number, change: Partial<TemplateItemDraft>) =>
    setDraft((d) => ({ ...d, items: d.items.map((item, i) => (i === index ? { ...item, ...change } : item)) }));
  const move = (index: number, by: -1 | 1) =>
    setDraft((d) => {
      const items = [...d.items];
      [items[index], items[index + by]] = [items[index + by], items[index]];
      return { ...d, items };
    });

  function add(hit: ExerciseHit) {
    setDraft((d) => ({
      ...d,
      items: [...d.items, { key: newKey(), exerciseId: hit.id, name: hit.name, sets: "3", reps: "", weight: "", duration: "", rest: "" }],
    }));
    setErrors((e) => e.filter((error) => error.kind !== "empty"));
    setPicking(false);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const result = templatePayload(draft, unit, id);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    startTransition(async () => {
      const saved = await saveWorkoutTemplate(result.payload);
      if (saved.ok) {
        toast.success(copy.saved);
        if (!id) router.replace(`/trainer/templates/${saved.id}`);
      } else {
        toast.error(copy.failed);
      }
    });
  }

  const label = (target: (typeof TARGETS)[number]) =>
    target === "weight" ? interpolate(copy.weight, { unit: t.workouts.sets.units[unit] }) : copy[target === "duration" ? "time" : target];

  return (
    <form onSubmit={save} noValidate className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
      <TextField
        label={copy.name}
        placeholder={copy.namePlaceholder}
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        maxLength={TEMPLATE_TITLE_MAX_LENGTH}
        required
        autoComplete="off"
        error={errors.some((e) => e.kind === "name") ? copy.errors.name : undefined}
      />
      <section className="flex flex-col gap-4" aria-labelledby="template-exercises">
        <h2 id="template-exercises" className="px-1 text-headline">
          {t.workouts.editor.exercises}
        </h2>
        {draft.items.map((item, index) => {
          const headingId = `template-item-${item.key}`;
          const invalid = errors.some((e) => e.kind === "targets" && e.item === index);
          return (
            <section key={item.key} aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
              <div className="flex items-start gap-1">
                <h3 id={headingId} className="min-w-0 flex-1 pt-2.5 text-headline">
                  {item.name}
                </h3>
                <IconButton
                  icon={ArrowUp}
                  label={`${t.workouts.editor.moveUp}: ${item.name}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  icon={ArrowDown}
                  label={`${t.workouts.editor.moveDown}: ${item.name}`}
                  disabled={index === draft.items.length - 1}
                  onClick={() => move(index, 1)}
                />
                <IconButton
                  icon={X}
                  label={`${t.workouts.editor.remove}: ${item.name}`}
                  onClick={() => setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }))}
                />
              </div>
              <div role="table" aria-label={`${copy.targets}: ${item.name}`} className="flex flex-col gap-1.5">
                <div role="row" className="grid grid-cols-5 gap-2 text-footnote text-ink-2">
                  {TARGETS.map((target) => (
                    <span role="columnheader" key={target} className="truncate">
                      {label(target)}
                    </span>
                  ))}
                </div>
                <div role="row" className="grid grid-cols-5 gap-2">
                  {TARGETS.map((target) => (
                    <SetInput
                      key={target}
                      label={`${item.name}, ${label(target)}`}
                      inputMode={target === "weight" ? "decimal" : target === "duration" ? "text" : "numeric"}
                      value={item[target]}
                      invalid={invalid}
                      onChange={(value) => update(index, { [target]: value })}
                    />
                  ))}
                </div>
              </div>
              {invalid ? <p className="text-footnote text-danger">{copy.errors.targets}</p> : null}
            </section>
          );
        })}
        {errors.some((e) => e.kind === "empty") ? <p className="px-1 text-footnote text-danger">{copy.errors.empty}</p> : null}
        {draft.items.length < MAX_EXERCISES ? (
          <Button type="button" variant="secondary" icon={Plus} onClick={() => setPicking(true)} block>
            {t.workouts.editor.addExercise}
          </Button>
        ) : null}
      </section>
      <TextArea
        label={copy.notes}
        value={draft.notes}
        onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
        maxLength={TEMPLATE_NOTES_MAX_LENGTH}
        rows={3}
      />
      <Button type="submit" loading={pending} block>
        {copy.save}
      </Button>
      <ExercisePicker open={picking} onOpenChange={setPicking} onPick={add} />
    </form>
  );
}

/** "Убрать в архив" / "Вернуть из архива" under a saved template. */
export function ArchiveTemplate({ id, archived }: { id: string; archived: boolean }) {
  const { t } = useI18n();
  const copy = t.workouts.templates;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      icon={archived ? ArchiveRestore : Archive}
      loading={pending}
      block
      onClick={() =>
        startTransition(async () => {
          const result = await setTemplateArchived({ id, archived: !archived });
          if (result.ok) toast.success(archived ? copy.restoredToast : copy.archivedToast);
          else toast.error(copy.failed);
        })
      }
    >
      {archived ? copy.restore : copy.archive}
    </Button>
  );
}
