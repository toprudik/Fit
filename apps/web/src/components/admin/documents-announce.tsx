"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { announceDocumentsUpdate, type AnnounceDocumentsResult } from "@/lib/admin/documents-actions";

/** The device's date `offset` days from today, as YYYY-MM-DD for a date input. */
function localDay(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * «Объявить новые редакции документов» (право 15): the day the new versions take effect, then a confirmation, since the
 * bot writes to everyone with an account and a sent message can't be taken back.
 */
export function DocumentsAnnounce() {
  const { t, locale } = useI18n();
  const copy = t.adminShell.documents;
  const [day, setDay] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function report(result: AnnounceDocumentsResult) {
    setConfirming(false);
    if (result.status === "done") {
      setError(undefined);
      setDay("");
      if (result.queued === 0) toast.info(copy.already);
      else toast.success(interpolate(copy.queued, { count: result.queued }));
    } else if (result.status === "invalid-date") setError(copy.invalidDate);
    else if (result.status === "date-not-ahead") setError(copy.notAhead);
    else toast.error(copy.failed);
  }

  const dayName = day ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)) : "";

  if (confirming) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-callout">{interpolate(copy.confirmText, { date: dayName })}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={pending} onClick={() => startTransition(async () => report(await announceDocumentsUpdate(day)))}>
            {copy.send}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            {copy.cancel}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!day) {
          setError(copy.invalidDate);
          return;
        }
        // The server checks the day against Moscow too; this catches today and past days before the confirmation.
        if (day < localDay(1)) {
          setError(copy.notAhead);
          return;
        }
        setError(undefined);
        setConfirming(true);
      }}
    >
      <TextField
        name="effective-on"
        type="date"
        label={copy.dateLabel}
        hint={copy.dateHint}
        value={day}
        onChange={(event) => setDay(event.target.value)}
        error={error}
        className="sm:max-w-56"
      />
      <Button type="submit" size="sm" className="self-start">
        {copy.action}
      </Button>
    </form>
  );
}
