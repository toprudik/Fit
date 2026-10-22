"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { SELECT_CLASS } from "@/components/schedule/week-template-editor";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { createAssistedSession, type AssistedSessionResult } from "@/lib/delegations/assistant-actions";
import { DURATIONS } from "@/lib/schedule/template";

type Mode = "offline" | "online";

/** Tomorrow on the device, YYYY-MM-DD: the form's first day. */
function tomorrow(): string {
  const day = new Date(Date.now() + 86_400_000);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

/**
 * «Новое занятие» for an assistant with the schedule scope: one personal session of the delegated client in
 * the owner's schedule. Date and time are on the assistant's clock, as the card shows every session.
 */
export function NewAssistedSession({
  coachingId,
  ownerName,
  locations,
}: {
  coachingId: string;
  ownerName: string;
  locations: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const copy = t.delegatedZone;
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(tomorrow);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState<number>(60);
  const [mode, setMode] = useState<Mode>("offline");
  const [locationId, setLocationId] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<Exclude<AssistedSessionResult, { ok: true }>["reason"] | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!day || !time) return setError("failed");
    setError(null);
    startTransition(async () => {
      const common = { coachingId, day, time, durationMin: duration };
      const result = await createAssistedSession(
        mode === "offline" ? { ...common, mode, locationId: locationId || null } : { ...common, mode, meetingUrl: link.trim() || null },
      );
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      setOpen(false);
      toast.success(copy.created);
    });
  }

  return (
    <>
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        <Plus aria-hidden size={20} />
        {copy.newSession}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={copy.newSession}
        description={interpolate(copy.newSessionText, { name: ownerName || copy.noName })}
        actions={
          <>
            <Button size="lg" block loading={pending} onClick={submit}>
              {copy.create}
            </Button>
            <Button variant="ghost" size="lg" block disabled={pending} onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <DateField label={copy.date} value={day} min={tomorrow()} onChange={setDay} required />
            <TimeField label={copy.time} value={time} hint={copy.timeHint} onChange={setTime} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assisted-duration" className="px-1 text-footnote text-ink-2">
              {copy.duration}
            </label>
            <select id="assisted-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className={SELECT_CLASS}>
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {interpolate(copy.minutes, { minutes })}
                </option>
              ))}
            </select>
          </div>
          <SegmentedControl
            label={copy.format}
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "offline", label: copy.offline },
              { value: "online", label: copy.online },
            ]}
          />
          {mode === "offline" ? (
            locations.length ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="assisted-place" className="px-1 text-footnote text-ink-2">
                  {copy.place}
                </label>
                <select id="assisted-place" value={locationId} onChange={(event) => setLocationId(event.target.value)} className={SELECT_CLASS}>
                  <option value="">{copy.noPlace}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null
          ) : (
            <TextField
              label={copy.link}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={link}
              hint={copy.linkHint}
              error={error === "link" ? copy.errors.link : undefined}
              onChange={(event) => setLink(event.target.value)}
            />
          )}
          {error && error !== "link" ? (
            <p role="alert" className="px-1 text-footnote text-danger">
              {copy.errors[error]}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
