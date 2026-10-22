"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { TimeField } from "@/components/ui/time-field";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate, plural } from "@/i18n/format";
import { saveWeekTemplate } from "@/lib/schedule/actions";
import { BUFFERS, DURATIONS, HORIZON_WEEKS, overlapsAny, slotsInWindow, sortWindows, type TemplateWindow } from "@/lib/schedule/template";

type Mode = TemplateWindow["mode"];

export const SELECT_CLASS =
  "h-13 w-full rounded-sm border border-field-line bg-field px-4 text-body text-ink outline-none focus:border-focus-ring focus:shadow-[0_0_0_1px_var(--focus-ring)]";

const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

type TemplateCopy = ReturnType<typeof useI18n>["t"]["schedule"]["templatePage"];

const newDraft = (mode: Mode): TemplateWindow => ({
  isoWeekday: 1,
  start: "09:00",
  end: "13:00",
  durationMin: 60,
  mode,
  locationId: null,
  meetingUrl: null,
});

/** The window the form holds, ready for the template, or why it can't go in. */
function checkDraft(
  draft: TemplateWindow,
  windows: readonly TemplateWindow[],
  bufferMin: number,
  copy: TemplateCopy,
): { window: TemplateWindow } | { error: string } {
  if (!draft.start || !draft.end || draft.end <= draft.start || slotsInWindow(draft, bufferMin) === 0) return { error: copy.windowInvalid };
  if (draft.mode === "online" && draft.meetingUrl && !/^https:\/\/\S+$/.test(draft.meetingUrl)) return { error: copy.urlInvalid };
  if (overlapsAny(draft, windows)) return { error: copy.overlap };
  return {
    window: {
      ...draft,
      locationId: draft.mode === "offline" ? draft.locationId : null,
      meetingUrl: draft.mode === "online" ? draft.meetingUrl?.trim() || null : null,
    },
  };
}

/** The new-window form: one weekday, its hours, the session length and where it happens. */
function WindowForm({
  draft,
  error,
  locations,
  onChange: change,
  onAdd,
  onCancel,
}: {
  draft: TemplateWindow;
  error: string | null;
  locations: { id: string; name: string }[];
  onChange: (patch: Partial<TemplateWindow>) => void;
  onAdd: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const copy = t.schedule.templatePage;

  return (
    <section aria-labelledby="new-window" className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <h2 id="new-window" className="text-headline">
        {copy.newWindow}
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="window-day" className="px-1 text-footnote text-ink-2">
          {copy.day}
        </label>
        <select id="window-day" value={draft.isoWeekday} onChange={(event) => change({ isoWeekday: Number(event.target.value) })} className={SELECT_CLASS}>
          {WEEKDAYS.map((day) => (
            <option key={day} value={day}>
              {t.schedule.weekdays[day]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TimeField label={copy.from} value={draft.start} onChange={(start) => change({ start })} />
        <TimeField label={copy.to} value={draft.end} onChange={(end) => change({ end })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="window-duration" className="px-1 text-footnote text-ink-2">
          {copy.duration}
        </label>
        <select
          id="window-duration"
          value={draft.durationMin}
          onChange={(event) => change({ durationMin: Number(event.target.value) })}
          className={SELECT_CLASS}
        >
          {DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {interpolate(copy.minutes, { minutes })}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-footnote text-ink-2">{copy.format}</span>
        <SegmentedControl
          label={copy.format}
          value={draft.mode}
          onValueChange={(mode) => change({ mode })}
          options={[
            { value: "offline", label: copy.offline },
            { value: "online", label: copy.online },
          ]}
        />
      </div>
      {draft.mode === "offline" && locations.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="window-location" className="px-1 text-footnote text-ink-2">
            {copy.location}
          </label>
          <select
            id="window-location"
            value={draft.locationId ?? ""}
            onChange={(event) => change({ locationId: event.target.value || null })}
            className={SELECT_CLASS}
          >
            <option value="">{copy.noLocation}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {draft.mode === "online" ? (
        <TextField
          label={copy.meetingUrl}
          type="url"
          inputMode="url"
          placeholder="https://"
          hint={copy.meetingUrlHint}
          value={draft.meetingUrl ?? ""}
          onChange={(event) => change({ meetingUrl: event.target.value })}
          maxLength={500}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-subhead text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={onAdd}>
          {copy.add}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {copy.cancel}
        </Button>
      </div>
    </section>
  );
}

/**
 * The week template editor (screens.md /trainer/schedule/template): windows by weekday with the slots
 * each gives, how far ahead booking opens and the break between sessions. Nothing is saved until
 * "Сохранить шаблон", which sends the whole week to save_week_template.
 */
export function WeekTemplateEditor({
  initialWindows,
  initialHorizonWeeks,
  initialBufferMin,
  locations,
  defaultMode,
}: {
  initialWindows: TemplateWindow[];
  initialHorizonWeeks: number;
  initialBufferMin: number;
  locations: { id: string; name: string }[];
  defaultMode: Mode;
}) {
  const { t, locale } = useI18n();
  const copy = t.schedule.templatePage;
  const [windows, setWindows] = useState(() => sortWindows(initialWindows));
  const [horizonWeeks, setHorizonWeeks] = useState(initialHorizonWeeks);
  const [bufferMin, setBufferMin] = useState(initialBufferMin);
  // The open new-window form; "Сохранить шаблон" takes it in too, so a filled window is never lost.
  const [draft, setDraft] = useState<TemplateWindow | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Stays under the button after a save, so the trainer sees it went through even when the toast is missed (QA T17).
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const placeName = new Map(locations.map((location) => [location.id, location.name]));

  const edit = (next: () => void) => {
    next();
    setDirty(true);
    setSaved(false);
    setError(null);
  };

  /** Adds the open form's window and returns the new week; null when it can't go in, with the reason under the form. */
  const takeDraft = (): TemplateWindow[] | null => {
    if (!draft) return windows;
    const checked = checkDraft(draft, windows, bufferMin, copy);
    if ("error" in checked) {
      setDraftError(checked.error);
      return null;
    }
    const next = sortWindows([...windows, checked.window]);
    edit(() => setWindows(next));
    setDraft(null);
    return next;
  };

  const save = () => {
    const toSave = takeDraft();
    if (!toSave) return;
    startTransition(async () => {
      const result = await saveWeekTemplate({ windows: toSave, horizonWeeks, bufferMin });
      if (result.status === "done") {
        setDirty(false);
        setSaved(true);
        toast.success(toSave.length === 0 ? copy.savedEmpty : interpolate(copy.saved, { count: result.slots }));
      } else {
        setError(result.status === "overlap" ? copy.overlap : result.status === "invalid" ? copy.windowInvalid : copy.failed);
      }
    });
  };

  const days = WEEKDAYS.map(Number).filter((day) => windows.some((window) => window.isoWeekday === day));

  return (
    <div className="flex flex-col gap-6">
      {days.length === 0 ? <p className="px-1 text-callout text-ink-2">{copy.empty}</p> : null}
      {days.map((day) => (
        <ListGroup key={day} header={t.schedule.weekdays[String(day) as (typeof WEEKDAYS)[number]]}>
          {windows
            .filter((window) => window.isoWeekday === day)
            .map((window) => {
              const where = window.mode === "online" ? t.schedule.online : window.locationId && placeName.get(window.locationId);
              const label = `${window.start}–${window.end}`;
              return (
                <ListRow
                  key={`${window.isoWeekday}-${window.start}`}
                  title={<span className="tabular-nums">{label}</span>}
                  subtitle={[interpolate(copy.minutes, { minutes: window.durationMin }), where].filter(Boolean).join(", ")}
                  value={plural(locale, slotsInWindow(window, bufferMin), copy.slotCount)}
                  trailing={
                    <IconButton
                      icon={Trash2}
                      label={`${copy.remove} ${label}`}
                      onClick={() => edit(() => setWindows((current) => current.filter((other) => other !== window)))}
                    />
                  }
                />
              );
            })}
        </ListGroup>
      ))}

      {draft ? (
        <WindowForm
          draft={draft}
          error={draftError}
          locations={locations}
          onChange={(patch) => {
            setDraft((current) => (current ? { ...current, ...patch } : current));
            setDraftError(null);
          }}
          onCancel={() => setDraft(null)}
          onAdd={() => void takeDraft()}
        />
      ) : (
        <div>
          <Button type="button" variant="secondary" icon={Plus} onClick={() => {
              setDraft(newDraft(defaultMode));
              setDraftError(null);
            }}>
            {copy.addWindow}
          </Button>
        </div>
      )}

      <section aria-labelledby="template-settings" className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <h2 id="template-settings" className="text-headline">
          {copy.settings}
        </h2>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="template-horizon" className="px-1 text-footnote text-ink-2">
            {copy.horizon}
          </label>
          <select
            id="template-horizon"
            value={horizonWeeks}
            onChange={(event) => edit(() => setHorizonWeeks(Number(event.target.value)))}
            className={SELECT_CLASS}
          >
            {HORIZON_WEEKS.map((weeks) => (
              <option key={weeks} value={weeks}>
                {plural(locale, weeks, copy.weeks)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="template-buffer" className="px-1 text-footnote text-ink-2">
            {copy.buffer}
          </label>
          <select id="template-buffer" value={bufferMin} onChange={(event) => edit(() => setBufferMin(Number(event.target.value)))} className={SELECT_CLASS}>
            {BUFFERS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? copy.noBuffer : interpolate(copy.minutes, { minutes })}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-subhead text-danger">
            {error}
          </p>
        ) : dirty ? (
          <p className="px-1 text-footnote text-ink-2">{copy.unsaved}</p>
        ) : saved ? (
          <p role="status" className="px-1 text-footnote text-ink-2">
            {copy.allSaved}
          </p>
        ) : null}
        <Button type="button" size="lg" block loading={pending} onClick={save}>
          {copy.save}
        </Button>
      </div>
    </div>
  );
}
