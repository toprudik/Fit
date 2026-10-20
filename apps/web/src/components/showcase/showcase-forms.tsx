"use client";

import { useActionState, useEffect, useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import {
  saveShowcaseAddress,
  setStoryCardShowcase,
  type AddressState,
} from "@/lib/showcase/actions";
import { SLUG_MAX_LENGTH } from "@/lib/showcase/link";
import { hapticSuccess } from "@/lib/telegram/mini-app";

const ADDRESS_IDLE: AddressState = { status: "idle" };

/** "Адрес витрины": the slug part of /trainers/<slug>, saved on its own button. */
export function ShowcaseAddressForm({ slug }: { slug: string }) {
  const { t } = useI18n();
  const copy = t.showcase.editor.address;
  const [state, action, pending] = useActionState(saveShowcaseAddress, ADDRESS_IDLE);

  useEffect(() => {
    if (state.status !== "saved") return;
    hapticSuccess();
    toast.success(copy.saved);
  }, [state, copy.saved]);

  const value = state.status === "error" ? state.value : state.status === "saved" ? state.slug : slug;
  return (
    // key: React resets an uncontrolled form after its action, so the field starts again from what the
    // server answered.
    <form key={JSON.stringify(state)} action={action} className="flex flex-col gap-3">
      <TextField
        label={copy.label}
        name="slug"
        defaultValue={value}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={SLUG_MAX_LENGTH + 8}
        hint={copy.hint}
        error={state.status === "error" ? copy[state.reason] : undefined}
      />
      <Button type="submit" variant="secondary" size="lg" block loading={pending}>
        {copy.save}
      </Button>
    </form>
  );
}

/** "Имя и QR на карточках клиентов" (PRD wave-3 §4 rule 7): the trainer card of a client's month, on by default. */
export function StoryCardsSwitch({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const copy = t.showcase.editor;
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [, startTransition] = useTransition();
  return (
    <div className="rounded-lg bg-surface-1 px-4 py-3">
      <Switch
        showLabel
        label={copy.storyCards}
        hint={copy.storyCardsHint}
        checked={optimistic}
        onCheckedChange={(next) =>
          startTransition(async () => {
            setOptimistic(next);
            const result = await setStoryCardShowcase(next);
            if (!result.ok) toast.error(copy.storyCardsFailed);
          })
        }
      />
    </div>
  );
}
