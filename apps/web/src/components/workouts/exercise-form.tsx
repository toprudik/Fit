"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipCheckbox, ChipRadio } from "@/components/ui/chip";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { saveExercise, type ExerciseInput } from "@/lib/workouts/actions";
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_DESCRIPTION_MAX_LENGTH,
  EXERCISE_NAME_MAX_LENGTH,
  MUSCLES,
  VIDEO_URL_MAX_LENGTH,
} from "@/lib/workouts/catalog";

export type ExerciseFormValues = Omit<ExerciseInput, "id" | "basedOn" | "locale">;

type Field = "name" | "category" | "description" | "videoUrl";

/**
 * Create or edit a trainer's own exercise (PRD wave-1 §2.10-1, 2.10-8): name, muscle group, muscles,
 * equipment, description and a video link. After saving it opens the exercise card.
 */
export function ExerciseForm({ id, basedOn, initial }: { id?: string; basedOn?: string; initial: ExerciseFormValues }) {
  const { t, locale } = useI18n();
  const copy = t.workouts.form;
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Field[]>([]);
  const [pending, startTransition] = useTransition();
  const error = (field: Field) => (errors.includes(field) ? copy.errors[field] : undefined);
  const toggle = (list: "muscles" | "equipment", key: string, on: boolean) =>
    setValues((v) => ({ ...v, [list]: on ? [...v[list], key] : v[list].filter((k) => k !== key) }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveExercise({ ...values, id, basedOn, locale });
      if (result.ok) {
        setErrors([]);
        toast.success(copy.saved);
        router.push(`/trainer/exercises/${result.id}`);
      } else if (result.reason === "invalid") {
        setErrors(result.fields);
      } else {
        toast.error(copy.failed);
      }
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <TextField
        label={copy.name}
        value={values.name}
        onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        maxLength={EXERCISE_NAME_MAX_LENGTH}
        required
        autoComplete="off"
        error={error("name")}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.category}</legend>
        <div className="flex flex-wrap gap-2">
          {EXERCISE_CATEGORIES.map((category) => (
            <ChipRadio
              key={category}
              name="category"
              value={category}
              checked={values.category === category}
              onChange={() => setValues((v) => ({ ...v, category }))}
            >
              {t.workouts.categories[category]}
            </ChipRadio>
          ))}
        </div>
        {error("category") ? <p className="px-1 text-footnote text-danger">{error("category")}</p> : null}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.muscles}</legend>
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((muscle) => (
            <ChipCheckbox
              key={muscle}
              checked={values.muscles.includes(muscle)}
              onChange={(e) => toggle("muscles", muscle, e.target.checked)}
            >
              {t.workouts.muscles[muscle]}
            </ChipCheckbox>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 px-1 text-footnote text-ink-2">{copy.equipment}</legend>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT.map((item) => (
            <ChipCheckbox
              key={item}
              checked={values.equipment.includes(item)}
              onChange={(e) => toggle("equipment", item, e.target.checked)}
            >
              {t.workouts.equipment[item]}
            </ChipCheckbox>
          ))}
        </div>
      </fieldset>
      <TextArea
        label={copy.description}
        hint={copy.descriptionHint}
        value={values.description}
        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
        maxLength={EXERCISE_DESCRIPTION_MAX_LENGTH}
        rows={5}
        error={error("description")}
      />
      <TextField
        label={copy.video}
        hint={copy.videoHint}
        type="url"
        inputMode="url"
        placeholder="https://"
        value={values.videoUrl}
        onChange={(e) => setValues((v) => ({ ...v, videoUrl: e.target.value }))}
        maxLength={VIDEO_URL_MAX_LENGTH}
        autoComplete="off"
        error={error("videoUrl")}
      />
      <Button type="submit" loading={pending} block>
        {copy.save}
      </Button>
    </form>
  );
}
