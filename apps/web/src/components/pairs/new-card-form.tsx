"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { createCard } from "@/lib/pairs/actions";
import { CARD_CONTACT_MAX_LENGTH, CARD_NAME_MAX_LENGTH, NOTE_MAX_LENGTH } from "@/lib/pairs/clients";
import { hapticSuccess } from "@/lib/telegram/mini-app";

type Errors = { name?: string; contact?: string; note?: string };

/** The form of "Добавить клиента вручную": name, then the optional contact and note; "Создать" opens the new card. */
export function NewCardForm() {
  const { t } = useI18n();
  const copy = t.pairs.cards;
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const contact = String(formData.get("contact") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const next: Errors = {
      name: !name ? copy.nameEmpty : name.length > CARD_NAME_MAX_LENGTH ? copy.nameTooLong : undefined,
      contact: contact.length > CARD_CONTACT_MAX_LENGTH ? copy.contactTooLong : undefined,
      note: note.length > NOTE_MAX_LENGTH ? t.pairs.notes.tooLong : undefined,
    };
    setErrors(next);
    if (next.name || next.contact || next.note) return;
    startTransition(async () => {
      const result = await createCard({ name, contact, note });
      if (result.ok) {
        hapticSuccess();
        toast.success(copy.created);
        router.push(`/trainer/clients/${result.coachingId}`);
      } else if (result.reason === "limit") {
        toast.error(copy.limitText);
        router.refresh();
      } else if (result.reason === "dpa") {
        router.refresh();
      } else {
        toast.error(t.pairs.failed);
      }
    });
  }

  return (
    <form action={submit} noValidate className="flex flex-col gap-4">
      <TextField
        name="name"
        label={copy.nameLabel}
        error={errors.name}
        autoComplete="off"
        maxLength={CARD_NAME_MAX_LENGTH + 20}
        required
      />
      <TextField
        name="contact"
        label={copy.contactLabel}
        hint={copy.contactHint}
        error={errors.contact}
        autoComplete="off"
        maxLength={CARD_CONTACT_MAX_LENGTH + 20}
      />
      <TextArea name="note" label={copy.noteLabel} hint={copy.noteHint} error={errors.note} rows={3} maxLength={NOTE_MAX_LENGTH + 100} />
      <Button type="submit" size="lg" block loading={pending}>
        {copy.create}
      </Button>
    </form>
  );
}
