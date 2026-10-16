"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { requestAccountDeletion } from "@/lib/account/actions";

/** The typed confirmation and the destructive button (screens.md /settings/delete). */
export function DeleteForm() {
  const { t } = useI18n();
  const copy = t.account.delete;
  const word = copy.confirmWord;
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const typed = String(formData.get("confirm") ?? "");
    if (typed.trim().toLocaleUpperCase() !== word) {
      setError(interpolate(copy.confirmMismatch, { word }));
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await requestAccountDeletion(typed);
      if (!result.ok) toast.error(result.reason === "invalid" ? interpolate(copy.confirmMismatch, { word }) : copy.failed);
    });
  }

  return (
    <form action={submit} noValidate className="flex flex-col gap-4">
      <TextField name="confirm" label={interpolate(copy.confirmLabel, { word })} autoComplete="off" autoCapitalize="characters" error={error} />
      <Button type="submit" variant="destructive" size="lg" block loading={pending}>
        {copy.submit}
      </Button>
    </form>
  );
}
