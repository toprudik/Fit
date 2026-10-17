"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipRadio } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { archiveGroup, createGroup, updateGroup } from "@/lib/groups/actions";
import { GROUP_COLORS, GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, GROUP_PRESETS } from "@/lib/groups/rules";
import { GOALS, type Goal } from "@/lib/nutrition/target";

export type EditableGroup = { id: string; name: string; goal: Goal | null; description: string | null; color: string | null };

type Preset = (typeof GROUP_PRESETS)[number] | "custom";

/**
 * "Новая группа" (with the templates «Сброс веса», «Набор массы», «Поддержание», PRD wave-2 §6 rule 3) and
 * "Изменить группу": name, goal, colour and a description only the trainer sees.
 */
export function GroupFormButton({ initial, variant = "primary" }: { initial?: EditableGroup; variant?: "primary" | "secondary" }) {
  const { t } = useI18n();
  const copy = t.trainerGroups;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("lose");
  const [name, setName] = useState(initial?.name ?? copy.presets.lose);
  const [goal, setGoal] = useState<Goal | null>(initial ? initial.goal : "lose");
  const [color, setColor] = useState<string>(initial?.color ?? GROUP_COLORS[0]);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [nameError, setNameError] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(next: Preset) {
    setPreset(next);
    if (next === "custom") {
      setName("");
      setGoal(null);
    } else {
      setName(copy.presets[next]);
      setGoal(next);
    }
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > GROUP_NAME_MAX) {
      setNameError(true);
      return;
    }
    setNameError(false);
    startTransition(async () => {
      const input = { name: trimmed, goal, description: description.trim() || null, color };
      if (initial) {
        const result = await updateGroup(initial.id, input);
        if (!result.ok) {
          toast.error(copy.form.failed);
          return;
        }
        toast.success(copy.form.saved);
        setOpen(false);
        return;
      }
      const result = await createGroup(input);
      if (!result.ok) {
        toast.error(result.reason === "plan" ? copy.form.plan : copy.form.failed);
        return;
      }
      toast.success(copy.form.created);
      setOpen(false);
      router.push(`/trainer/groups/${result.value}`);
    });
  }

  return (
    <>
      <Button icon={initial ? Pencil : Plus} variant={variant} onClick={() => setOpen(true)}>
        {initial ? copy.edit : copy.create}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={initial ? copy.form.editTitle : copy.form.title}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {initial ? null : (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.form.preset}</legend>
              <div className="flex flex-wrap gap-2">
                {[...GROUP_PRESETS, "custom" as const].map((option) => (
                  <ChipRadio key={option} name="preset" value={option} checked={preset === option} onChange={() => pick(option)}>
                    {option === "custom" ? copy.custom : copy.presets[option]}
                  </ChipRadio>
                ))}
              </div>
            </fieldset>
          )}
          <TextField
            label={copy.form.name}
            value={name}
            maxLength={GROUP_NAME_MAX}
            onChange={(event) => setName(event.target.value)}
            error={nameError ? copy.form.nameError : undefined}
            autoComplete="off"
          />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.form.goal}</legend>
            <div className="flex flex-wrap gap-2">
              <ChipRadio name="goal" value="" checked={goal === null} onChange={() => setGoal(null)}>
                {copy.form.noGoal}
              </ChipRadio>
              {GOALS.map((option) => (
                <ChipRadio key={option} name="goal" value={option} checked={goal === option} onChange={() => setGoal(option)}>
                  {copy.goals[option]}
                </ChipRadio>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.form.color}</legend>
            <div className="flex flex-wrap gap-3">
              {GROUP_COLORS.map((option, index) => (
                <label key={option} className="relative inline-flex size-11 cursor-pointer items-center justify-center">
                  <input
                    type="radio"
                    name="color"
                    value={option}
                    checked={color === option}
                    onChange={() => setColor(option)}
                    aria-label={interpolate(copy.form.colorLabel, { index: index + 1 })}
                    className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none size-8 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                    style={{ backgroundColor: option }}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <TextArea
            label={copy.form.description}
            hint={copy.form.descriptionHint}
            value={description}
            maxLength={GROUP_DESCRIPTION_MAX}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button type="submit" size="lg" block loading={pending}>
            {initial ? copy.form.save : copy.form.create}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** "Удалить группу": archived after a confirmation, then back to the list. */
export function ArchiveGroupButton({ groupId, name }: { groupId: string; name: string }) {
  const { t } = useI18n();
  const copy = t.trainerGroups;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {copy.archive}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={interpolate(copy.archiveTitle, { name })}
        description={copy.archiveText}
        actions={
          <Button
            variant="destructive"
            size="lg"
            block
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await archiveGroup(groupId);
                if (!result.ok) {
                  toast.error(copy.form.failed);
                  return;
                }
                toast.success(copy.archived);
                setOpen(false);
                router.push("/trainer/groups");
              })
            }
          >
            {copy.archiveConfirm}
          </Button>
        }
      />
    </>
  );
}
