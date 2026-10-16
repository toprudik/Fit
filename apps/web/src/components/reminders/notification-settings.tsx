"use client";

import { BellRing } from "lucide-react";
import { useState, useTransition } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { setDefaultReminders, setDigestTime, setNotificationEnabled, setPairReminders, setQuietHours } from "@/lib/reminders/actions";
import type { NotificationSettingsData } from "@/lib/reminders/load";
import { formatOffset } from "@/lib/reminders/offsets";
import { CLIENT_TOGGLES, TRAINER_TOGGLES, type ToggleType } from "@/lib/reminders/types";
import { ReminderEditor } from "./reminder-editor";

type Editing = { kind: "pair"; coachingId: string; offsets: number[] } | { kind: "defaults"; offsets: number[] };

const DEFAULT_QUIET = { start: "22:00", end: "08:00" };

/**
 * /settings/notifications (screens.md, PRD wave-1 §2.9): the client's reminders per trainer, the trainer's
 * reminders for new clients, the time of their daily digest, quiet hours and the types that can be switched off. Each change saves at once.
 */
export function NotificationSettings({ data }: { data: NotificationSettingsData }) {
  const { t, locale } = useI18n();
  const copy = t.notificationSettings;
  // The last edited list stays while the sheet closes.
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [quiet, setQuiet] = useState(data.quietHours);
  const [quietError, setQuietError] = useState<string | null>(null);
  const [disabled, setDisabled] = useState<ToggleType[]>(data.disabled);
  const [digestTime, setDigestTimeState] = useState(data.digestTime);
  const [, startTransition] = useTransition();

  const summary = (offsets: number[]) =>
    offsets.length
      ? offsets
          .map((offset) =>
            interpolate(t.reminders.before, {
              time: formatOffset(locale, offset, t.reminders.units),
            }),
          )
          .join(", ")
      : copy.none;

  function edit(next: Editing) {
    setEditing(next);
    setEditorOpen(true);
  }

  async function saveOffsets(offsets: number[]): Promise<boolean> {
    if (!editing) return false;
    const result =
      editing.kind === "pair" ? await setPairReminders({ coachingId: editing.coachingId, offsets }) : await setDefaultReminders(offsets);
    if (result.ok) toast.success(copy.saved);
    else toast.error(copy.failed);
    return result.ok;
  }

  function saveQuiet(next: { start: string; end: string } | null) {
    if (next && next.start === next.end) {
      setQuietError(copy.quiet.same);
      return;
    }
    setQuietError(null);
    const previous = quiet;
    setQuiet(next);
    startTransition(async () => {
      const result = await setQuietHours(next);
      if (!result.ok) {
        setQuiet(previous);
        toast.error(copy.failed);
      }
    });
  }

  function saveDigestTime(next: string) {
    if (!next || next === digestTime) return;
    const previous = digestTime;
    setDigestTimeState(next);
    startTransition(async () => {
      const result = await setDigestTime(next);
      if (result.ok) toast.success(copy.saved);
      else {
        setDigestTimeState(previous);
        toast.error(copy.failed);
      }
    });
  }

  function toggle(type: ToggleType, enabled: boolean) {
    const previous = disabled;
    setDisabled(enabled ? disabled.filter((item) => item !== type) : [...disabled, type]);
    startTransition(async () => {
      const result = await setNotificationEnabled({ type, enabled });
      if (!result.ok) {
        setDisabled(previous);
        toast.error(copy.failed);
      }
    });
  }

  const toggles: ToggleType[] = [...CLIENT_TOGGLES, ...(data.trainerDefaults ? TRAINER_TOGGLES : [])];

  return (
    <div className="flex flex-col gap-8">
      {data.pairs.length ? (
        <ListGroup header={copy.clientHeader} footer={copy.clientFooter} headingLevel={2}>
          {data.pairs.map((pair) => {
            const name = pair.name || t.botMessages.unnamedTrainer;
            return (
              <ListRow
                key={pair.coachingId}
                avatar={{ name, src: pair.photoUrl }}
                title={name}
                subtitle={summary(pair.offsets)}
                onClick={() =>
                  edit({
                    kind: "pair",
                    coachingId: pair.coachingId,
                    offsets: pair.offsets,
                  })
                }
              />
            );
          })}
        </ListGroup>
      ) : (
        <section aria-labelledby="client-reminders" className="flex flex-col gap-2">
          <h2 id="client-reminders" className="px-1 text-footnote text-ink-2">
            {copy.clientHeader}
          </h2>
          <p className="rounded-lg bg-surface-1 p-4 text-callout text-ink-2">{copy.noTrainers}</p>
        </section>
      )}

      {data.trainerDefaults ? (
        <ListGroup header={copy.trainerHeader} footer={copy.trainerFooter} headingLevel={2}>
          <ListRow
            icon={BellRing}
            title={copy.trainerRow}
            subtitle={summary(data.trainerDefaults)}
            onClick={() =>
              edit({
                kind: "defaults",
                offsets: data.trainerDefaults ?? [],
              })
            }
          />
        </ListGroup>
      ) : null}

      {data.trainerDefaults ? (
        <section aria-labelledby="daily-digest" className="flex flex-col gap-2">
          <h2 id="daily-digest" className="px-1 text-footnote text-ink-2">
            {copy.types.items.daily_digest}
          </h2>
          <div className="rounded-lg bg-surface-1 p-4">
            <TextField
              key={`digest-${digestTime}`}
              type="time"
              label={copy.digest.label}
              defaultValue={digestTime}
              disabled={disabled.includes("daily_digest")}
              onBlur={(event) => saveDigestTime(event.target.value)}
            />
          </div>
          <p className="px-1 text-footnote text-ink-2">{copy.digest.footer}</p>
        </section>
      ) : null}

      <section aria-labelledby="quiet-hours" className="flex flex-col gap-2">
        <h2 id="quiet-hours" className="px-1 text-footnote text-ink-2">
          {copy.quiet.header}
        </h2>
        <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
          <Switch
            showLabel
            label={copy.quiet.label}
            checked={quiet !== null}
            onCheckedChange={(on) => saveQuiet(on ? DEFAULT_QUIET : null)}
          />
          {quiet ? (
            <div className="flex gap-3">
              <TextField
                key={`start-${quiet.start}`}
                type="time"
                label={copy.quiet.from}
                defaultValue={quiet.start}
                onBlur={(event) =>
                  event.target.value && event.target.value !== quiet.start && saveQuiet({ ...quiet, start: event.target.value })
                }
                className="flex-1"
              />
              <TextField
                key={`end-${quiet.end}`}
                type="time"
                label={copy.quiet.to}
                defaultValue={quiet.end}
                onBlur={(event) =>
                  event.target.value && event.target.value !== quiet.end && saveQuiet({ ...quiet, end: event.target.value })
                }
                className="flex-1"
              />
            </div>
          ) : null}
          {quietError ? (
            <p role="alert" className="text-footnote text-danger">
              {quietError}
            </p>
          ) : null}
        </div>
        <p className="px-1 text-footnote text-ink-2">{copy.quiet.footer}</p>
      </section>

      <section aria-labelledby="notification-types" className="flex flex-col gap-2">
        <h2 id="notification-types" className="px-1 text-footnote text-ink-2">
          {copy.types.header}
        </h2>
        <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
          {toggles.map((type) => (
            <Switch
              key={type}
              showLabel
              label={copy.types.items[type]}
              checked={!disabled.includes(type)}
              onCheckedChange={(on) => toggle(type, on)}
            />
          ))}
        </div>
        <p className="px-1 text-footnote text-ink-2">{copy.types.footer}</p>
      </section>

      <ReminderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editing?.kind === "defaults" ? copy.editor.titleDefaults : copy.editor.title}
        initial={editing?.offsets ?? []}
        onSave={saveOffsets}
      />
    </div>
  );
}
