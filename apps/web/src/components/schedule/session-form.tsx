"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ChipCheckbox } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import {
  createSession,
  updateSession,
  type SaveSessionResult,
  type SessionConflict,
  type SessionError,
} from "@/lib/schedule/session-actions";
import { DURATIONS } from "@/lib/schedule/template";
import { addDays, isoWeekday } from "@/lib/schedule/time";
import { SELECT_CLASS } from "./week-template-editor";

const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

export type SessionFormValues = {
  coachingId: string;
  day: string;
  time: string;
  durationMin: number;
  mode: "offline" | "online";
  locationId: string | null;
  meetingUrl: string;
  title: string;
};

type Props = {
  clients: { coachingId: string; name: string }[];
  locations: { id: string; name: string }[];
  timeZone: string;
  today: string;
  initial: SessionFormValues;
} & (
  | { kind: "create" }
  /** Editing: the client stays; a session of a repeat asks "Только это / Это и следующие". */
  | { kind: "edit"; sessionId: string; inRepeat: boolean }
);

/**
 * "Новое занятие" and "Изменить занятие" (screens.md /trainer/sessions/new and /[id]/edit, PRD 2.6.2): client,
 * day and time in the trainer's zone, length, where it happens and a weekly repeat. A time that overlaps
 * another session asks first (2.6.2-6).
 */
export function SessionForm(props: Props) {
  const { t, locale } = useI18n();
  const copy = t.schedule.sessionForm;
  const router = useRouter();
  const [values, setValues] = useState(props.initial);
  const [repeat, setRepeat] = useState<"none" | "weekly">("none");
  const [weekdays, setWeekdays] = useState<number[]>(() => [isoWeekday(props.initial.day)]);
  const [end, setEnd] = useState<"until" | "count">("count");
  const [until, setUntil] = useState(() => addDays(props.initial.day, 27));
  const [count, setCount] = useState("8");
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SessionConflict[]>([]);
  const [pending, startTransition] = useTransition();

  const change = (patch: Partial<SessionFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const errorText = (key: SessionError) => copy.errors[key];
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit", timeZone: props.timeZone });

  const done = (result: Extract<SaveSessionResult, { status: "done" }>) => {
    if (props.kind === "create") {
      toast.success(result.count > 1 ? interpolate(copy.assignedMany, { count: result.count }) : copy.assigned);
      router.push(`/trainer/schedule?date=${values.day}`);
    } else {
      toast.success(copy.saved);
      router.push(`/trainer/sessions/${props.kind === "edit" ? props.sessionId : ""}`);
    }
  };

  const save = (force: boolean) =>
    startTransition(async () => {
      const common = {
        day: values.day,
        time: values.time,
        durationMin: values.durationMin,
        mode: values.mode,
        locationId: values.mode === "offline" ? values.locationId : null,
        meetingUrl: values.mode === "online" ? values.meetingUrl.trim() || null : null,
        title: values.title.trim() || null,
        force,
      };
      const result =
        props.kind === "create"
          ? await createSession({
              ...common,
              coachingId: values.coachingId,
              repeat:
                repeat === "weekly"
                  ? {
                      weekdays,
                      until: end === "until" ? until : null,
                      count: end === "count" ? Number(count) : null,
                    }
                  : null,
            })
          : await updateSession({ ...common, sessionId: props.sessionId, following });
      if (result.status === "done") return done(result);
      if (result.status === "conflict") return setConflicts(result.conflicts);
      setConflicts([]);
      setError(errorText(result.error));
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (props.kind === "create" && !values.coachingId) return setError(copy.chooseClient);
    if (values.mode === "online" && values.meetingUrl.trim() && !/^https:\/\/\S+$/.test(values.meetingUrl.trim())) {
      return setError(copy.errors.invalid_link);
    }
    if (repeat === "weekly" && props.kind === "create") {
      const countValue = Number(count);
      const badCount = end === "count" && (!Number.isInteger(countValue) || countValue < 2 || countValue > 200);
      const badUntil = end === "until" && (!until || until <= values.day || until > addDays(values.day, 366));
      if (!weekdays.includes(isoWeekday(values.day)) || badCount || badUntil) return setError(copy.errors.invalid_repeat);
    }
    save(false);
  };

  const toggleWeekday = (day: number) => {
    setWeekdays((current) => (current.includes(day) ? current.filter((other) => other !== day) : [...current, day].sort()));
    setError(null);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        {props.kind === "create" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-client" className="px-1 text-footnote text-ink-2">
              {copy.client}
            </label>
            <select
              id="session-client"
              value={values.coachingId}
              onChange={(event) => change({ coachingId: event.target.value })}
              className={SELECT_CLASS}
              required
            >
              <option value="">{copy.chooseClient}</option>
              {props.clients.map((client) => (
                <option key={client.coachingId} value={client.coachingId}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={copy.date}
            type="date"
            min={props.today}
            value={values.day}
            onChange={(event) => {
              const day = event.target.value;
              change({ day });
              if (day && repeat === "none") setWeekdays([isoWeekday(day)]);
            }}
            required
          />
          <TextField
            label={copy.time}
            type="time"
            value={values.time}
            onChange={(event) => change({ time: event.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="session-duration" className="px-1 text-footnote text-ink-2">
            {copy.duration}
          </label>
          <select
            id="session-duration"
            value={values.durationMin}
            onChange={(event) => change({ durationMin: Number(event.target.value) })}
            className={SELECT_CLASS}
          >
            {[...new Set([...DURATIONS, values.durationMin])]
              .sort((a, b) => a - b)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {interpolate(t.schedule.templatePage.minutes, { minutes })}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-footnote text-ink-2">{t.schedule.templatePage.format}</span>
          <SegmentedControl
            label={t.schedule.templatePage.format}
            value={values.mode}
            onValueChange={(mode) => change({ mode })}
            options={[
              { value: "offline", label: t.schedule.templatePage.offline },
              { value: "online", label: t.schedule.templatePage.online },
            ]}
          />
        </div>
        {values.mode === "offline" && props.locations.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="session-location" className="px-1 text-footnote text-ink-2">
              {t.schedule.templatePage.location}
            </label>
            <select
              id="session-location"
              value={values.locationId ?? ""}
              onChange={(event) => change({ locationId: event.target.value || null })}
              className={SELECT_CLASS}
            >
              <option value="">{t.schedule.templatePage.noLocation}</option>
              {props.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {values.mode === "online" ? (
          <TextField
            label={t.schedule.templatePage.meetingUrl}
            type="url"
            inputMode="url"
            placeholder="https://"
            hint={t.schedule.templatePage.meetingUrlHint}
            value={values.meetingUrl}
            onChange={(event) => change({ meetingUrl: event.target.value })}
            maxLength={500}
          />
        ) : null}
        <TextField
          label={copy.sessionTitle}
          hint={copy.sessionTitleHint}
          value={values.title}
          onChange={(event) => change({ title: event.target.value })}
          maxLength={120}
        />
      </div>

      {props.kind === "create" ? (
        <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-footnote text-ink-2">{copy.repeat}</span>
            <SegmentedControl
              label={copy.repeat}
              value={repeat}
              onValueChange={(next) => {
                setRepeat(next);
                setError(null);
              }}
              options={[
                { value: "none", label: copy.repeatNone },
                { value: "weekly", label: copy.repeatWeekly },
              ]}
            />
          </div>
          {repeat === "weekly" ? (
            <>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="px-1 pb-1.5 text-footnote text-ink-2">{copy.repeatDays}</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <ChipCheckbox
                      key={day}
                      checked={weekdays.includes(Number(day))}
                      onChange={() => toggleWeekday(Number(day))}
                      aria-label={t.schedule.weekdays[day]}
                    >
                      {copy.weekdaysShort[day]}
                    </ChipCheckbox>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-1.5">
                <span className="px-1 text-footnote text-ink-2">{copy.repeatEnd}</span>
                <SegmentedControl
                  label={copy.repeatEnd}
                  value={end}
                  onValueChange={(next) => {
                    setEnd(next);
                    setError(null);
                  }}
                  options={[
                    { value: "count", label: copy.repeatCount },
                    { value: "until", label: copy.repeatUntil },
                  ]}
                />
              </div>
              {end === "count" ? (
                <TextField
                  label={copy.count}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={200}
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              ) : (
                <TextField
                  label={copy.until}
                  type="date"
                  min={addDays(values.day, 1)}
                  max={addDays(values.day, 366)}
                  value={until}
                  onChange={(event) => setUntil(event.target.value)}
                />
              )}
            </>
          ) : null}
        </div>
      ) : props.inRepeat ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-surface-1 p-4">
          <span className="px-1 text-footnote text-ink-2">{copy.scope}</span>
          <SegmentedControl
            label={copy.scope}
            value={following ? "following" : "one"}
            onValueChange={(next) => {
              setFollowing(next === "following");
              setError(null);
            }}
            options={[
              { value: "one", label: copy.scopeOne },
              { value: "following", label: copy.scopeFollowing },
            ]}
          />
          {following ? <p className="px-1 text-footnote text-ink-2">{copy.scopeFollowingHint}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-subhead text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" block loading={pending && conflicts.length === 0}>
          {props.kind === "create" ? copy.submit : copy.save}
        </Button>
      </div>

      <Sheet
        open={conflicts.length > 0}
        onOpenChange={(open) => {
          if (!open) setConflicts([]);
        }}
        title={copy.conflictTitle}
        description={copy.conflictText}
        actions={
          <>
            <Button type="button" block loading={pending} onClick={() => save(true)}>
              {copy.conflictConfirm}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setConflicts([])}>
              {copy.conflictBack}
            </Button>
          </>
        }
      >
        <ul className="flex flex-col gap-1 text-callout text-ink">
          {conflicts.map((conflict) => (
            <li key={conflict.id} className="tabular-nums">
              {`${when.format(new Date(conflict.startsAt))}–${when.format(new Date(conflict.endsAt))}`}
              {conflict.name ? `, ${conflict.name}` : null}
            </li>
          ))}
        </ul>
      </Sheet>
    </form>
  );
}
