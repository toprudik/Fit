"use client";

import { Archive, ClipboardList, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipCheckbox } from "@/components/ui/chip";
import { IconButton } from "@/components/ui/icon-button";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { ExercisePicker } from "@/components/workouts/log-editor";
import { TemplatePicker } from "@/components/workouts/template-picker";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { archiveHomework, saveHomework } from "@/lib/homework/actions";
import { prescriptionFromTemplate } from "@/lib/homework/format";
import {
  addDays,
  HOMEWORK_DESCRIPTION_MAX_LENGTH,
  HOMEWORK_MAX_EXERCISES,
  HOMEWORK_PRESCRIPTION_MAX_LENGTH,
  HOMEWORK_REPEAT_MAX_DAYS,
  HOMEWORK_TITLE_MAX_LENGTH,
  homeworkPayload,
  WEEKDAYS,
  type HomeworkDraft,
  type HomeworkDraftError,
} from "@/lib/homework/homework";

let keySeed = 0;
const newKey = () => `h${++keySeed}`;

/**
 * "Задать домашку" and editing it (PRD wave-2 §10-1, 10-2): what to do, details, exercises from the library or
 * a template with a prescription each, a video link, the deadline and, optionally, weekdays up to a last day.
 * `today` is the client's day; deadlines follow it.
 */
export function HomeworkForm({
  target,
  initial,
  today,
}: {
  target: { coachingId: string } | { coachingId: string; id: string; dueDate: string };
  initial: HomeworkDraft;
  today: string;
}) {
  const { t, locale } = useI18n();
  const copy = t.homework.form;
  const [picking, setPicking] = useState(false);
  const [pickingTemplate, setPickingTemplate] = useState(false);
  const days = t.schedule.sessionForm.weekdaysShort;
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<HomeworkDraftError[]>([]);
  const [pending, startTransition] = useTransition();
  const editing = "id" in target;
  const error = (field: HomeworkDraftError) => (errors.includes(field) ? copy.errors[field] : undefined);

  const setExercises = (change: (exercises: HomeworkDraft["exercises"]) => HomeworkDraft["exercises"]) =>
    setDraft((d) => ({ ...d, exercises: change(d.exercises) }));

  function save(event: React.FormEvent) {
    event.preventDefault();
    const result = homeworkPayload(draft, today, editing ? { id: target.id, dueDate: target.dueDate } : { coachingId: target.coachingId });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    startTransition(async () => {
      const saved = await saveHomework(result.payload);
      if (!saved.ok) {
        toast.error(copy.reasons[saved.reason]);
        return;
      }
      toast.success(editing ? copy.saved : copy.created);
      if (!editing) router.replace(`/trainer/clients/${target.coachingId}/workouts`);
    });
  }

  return (
    <form onSubmit={save} noValidate className="flex w-full max-w-2xl flex-col gap-5 pt-4 md:pt-0">
      <TextField
        label={copy.title}
        placeholder={copy.titlePlaceholder}
        value={draft.title}
        onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        maxLength={HOMEWORK_TITLE_MAX_LENGTH}
        required
        autoComplete="off"
        error={error("title")}
      />
      <TextArea
        label={copy.description}
        value={draft.description}
        onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        maxLength={HOMEWORK_DESCRIPTION_MAX_LENGTH}
        rows={3}
      />
      <section className="flex flex-col gap-3" aria-labelledby="homework-exercises">
        <h2 id="homework-exercises" className="px-1 text-headline">
          {copy.exercises}
        </h2>
        {draft.exercises.map((exercise, index) => (
          <div key={exercise.key} className="flex items-end gap-2 rounded-lg bg-surface-1 p-3">
            <TextField
              className="min-w-0 flex-1"
              label={exercise.name}
              placeholder={copy.prescriptionPlaceholder}
              value={exercise.prescription}
              onChange={(e) =>
                setExercises((list) => list.map((x, i) => (i === index ? { ...x, prescription: e.target.value } : x)))
              }
              maxLength={HOMEWORK_PRESCRIPTION_MAX_LENGTH}
              autoComplete="off"
            />
            <IconButton
              icon={Trash2}
              label={interpolate(copy.removeExercise, { name: exercise.name })}
              onClick={() => setExercises((list) => list.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        {draft.exercises.length < HOMEWORK_MAX_EXERCISES ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" icon={Plus} onClick={() => setPicking(true)}>
              {copy.addExercise}
            </Button>
            <Button type="button" variant="ghost" icon={ClipboardList} onClick={() => setPickingTemplate(true)}>
              {t.workouts.templates.fromTemplate}
            </Button>
          </div>
        ) : null}
      </section>
      <TextField
        label={copy.videoUrl}
        hint={copy.videoHint}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={draft.videoUrl}
        onChange={(e) => setDraft((d) => ({ ...d, videoUrl: e.target.value }))}
        autoComplete="off"
        error={error("videoUrl")}
      />
      <TextField
        label={copy.dueDate}
        type="date"
        min={today}
        value={draft.dueDate}
        onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
        required
        error={error("dueDate")}
      />
      <Switch
        checked={draft.repeat}
        onCheckedChange={(repeat) =>
          setDraft((d) => ({ ...d, repeat, repeatUntil: d.repeatUntil || (d.dueDate ? addDays(d.dueDate, 27) : "") }))
        }
        label={copy.repeat}
        showLabel
      />
      {draft.repeat ? (
        <>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.weekdays}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <ChipCheckbox
                  key={day}
                  checked={draft.weekdays.includes(day)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      weekdays: e.target.checked ? [...d.weekdays, day] : d.weekdays.filter((x) => x !== day),
                    }))
                  }
                  aria-label={t.schedule.weekdays[String(day) as keyof typeof t.schedule.weekdays]}
                >
                  {days[String(day) as keyof typeof days]}
                </ChipCheckbox>
              ))}
            </div>
            {error("weekdays") ? <p className="px-1 text-footnote text-danger">{error("weekdays")}</p> : null}
          </fieldset>
          <TextField
            label={copy.repeatUntil}
            type="date"
            min={draft.dueDate || today}
            max={draft.dueDate ? addDays(draft.dueDate, HOMEWORK_REPEAT_MAX_DAYS) : undefined}
            value={draft.repeatUntil}
            onChange={(e) => setDraft((d) => ({ ...d, repeatUntil: e.target.value }))}
            error={error("repeatUntil")}
          />
        </>
      ) : null}
      <Button type="submit" loading={pending} block>
        {editing ? copy.save : copy.create}
      </Button>
      <ExercisePicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(hit) => {
          setExercises((list) => [...list, { key: newKey(), exerciseId: hit.id, name: hit.name, prescription: "" }]);
          setPicking(false);
        }}
      />
      <TemplatePicker
        open={pickingTemplate}
        onOpenChange={setPickingTemplate}
        onPick={(template) => {
          setDraft((d) => ({
            ...d,
            title: d.title.trim() ? d.title : template.title,
            exercises: template.items.slice(0, HOMEWORK_MAX_EXERCISES).map((item) => ({
              key: newKey(),
              exerciseId: item.exerciseId,
              name: item.name,
              prescription: prescriptionFromTemplate(t, locale, item),
            })),
          }));
          setPickingTemplate(false);
          toast.success(interpolate(t.workouts.templates.applied, { title: template.title }));
        }}
      />
    </form>
  );
}

/** "В архив" under a homework: off both sides' lists, back to the pair's workouts. */
export function ArchiveHomework({ id, coachingId }: { id: string; coachingId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      icon={Archive}
      loading={pending}
      block
      className="max-w-2xl"
      onClick={() =>
        startTransition(async () => {
          const result = await archiveHomework(id);
          if (!result.ok) {
            toast.error(t.homework.archiveFailed);
            return;
          }
          toast.success(t.homework.archivedToast);
          router.replace(`/trainer/clients/${coachingId}/workouts`);
        })
      }
    >
      {t.homework.archive}
    </Button>
  );
}
