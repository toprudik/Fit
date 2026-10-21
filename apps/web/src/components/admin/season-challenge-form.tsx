"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { cancelSeasonChallenge, createSeasonChallenge, type CreateSeasonResult } from "@/lib/season-challenge/actions";
import { SEASON_TITLE_MAX } from "@/lib/season-challenge/season";

/** «Запустить челлендж»: a title and a month, this one or later; one challenge a month. */
export function SeasonChallengeForm({ defaultMonth }: { defaultMonth: string }) {
  const { t } = useI18n();
  const copy = t.adminSeasonChallenges;
  const form = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<{ title?: string; month?: string }>({});
  const [pending, startTransition] = useTransition();

  function report(result: CreateSeasonResult) {
    if (result.status === "invalid-title") return setErrors({ title: copy.errors.invalidTitle });
    if (result.status === "invalid-month") return setErrors({ month: copy.errors.invalidMonth });
    if (result.status === "month-taken") return setErrors({ month: copy.errors.monthTaken });
    setErrors({});
    if (result.status === "done") {
      form.current?.reset();
      toast.success(copy.started);
    } else toast.error(copy.errors.failed);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = { title: String(data.get("title") ?? ""), month: String(data.get("month") ?? "") };
    startTransition(async () => report(await createSeasonChallenge(input)));
  }

  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-3">
      <TextField name="title" label={copy.titleLabel} hint={copy.titleHint} maxLength={SEASON_TITLE_MAX} error={errors.title} autoComplete="off" />
      <TextField name="month" type="month" label={copy.month} defaultValue={defaultMonth} error={errors.month} className="sm:max-w-56" />
      <Button type="submit" loading={pending} className="self-start">
        {copy.submit}
      </Button>
    </form>
  );
}

/** «Отменить» a challenge that has not finished. */
export function CancelSeasonChallenge({ id }: { id: string }) {
  const { t } = useI18n();
  const copy = t.adminSeasonChallenges;
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelSeasonChallenge(id);
          if (result.status === "done") toast.success(copy.cancelledToast);
          else if (result.status === "already") toast.error(copy.alreadyCancelled);
          else toast.error(copy.errors.failed);
        })
      }
    >
      {copy.cancel}
    </Button>
  );
}
