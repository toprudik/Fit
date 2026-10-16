"use client";

import { Eye, Lock } from "lucide-react";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { addNote, deleteNote, updateNote } from "@/lib/pairs/actions";
import { NOTE_MAX_LENGTH } from "@/lib/pairs/clients";

/** Why a note body is refused before it reaches the server, or nothing. */
function bodyError(body: string, copy: { emptyBody: string; tooLong: string }): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) return copy.emptyBody;
  if (trimmed.length > NOTE_MAX_LENGTH) return copy.tooLong;
  return undefined;
}

/** "Новая заметка": hidden from the client unless "Показать клиенту" is on (PRD wave-1 §2.5-4, Q38). */
export function NoteComposer({ coachingId, autoFocus = false }: { coachingId: string; autoFocus?: boolean }) {
  const { t } = useI18n();
  const copy = t.pairs.notes;
  const formRef = useRef<HTMLFormElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    const problem = bodyError(body, copy);
    setError(problem);
    if (problem) return;
    startTransition(async () => {
      const result = await addNote({ coachingId, body, visibleToClient: visible });
      if (!result.ok) {
        toast.error(t.pairs.failed);
        return;
      }
      formRef.current?.reset();
      setVisible(false);
      toast.success(copy.added);
    });
  }

  return (
    <form ref={formRef} id="new-note" action={submit} noValidate className="flex flex-col gap-3">
      <TextArea name="body" label={copy.newLabel} error={error} maxLength={NOTE_MAX_LENGTH + 100} autoFocus={autoFocus} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip icon={Eye} selected={visible} onClick={() => setVisible((current) => !current)}>
          {copy.showToClient}
        </Chip>
        <Button type="submit" loading={pending}>
          {copy.add}
        </Button>
      </div>
    </form>
  );
}

export type NoteView = {
  id: string;
  body: string;
  visibleToClient: boolean;
  /** Formatted on the server in the viewer's time zone. */
  createdLabel: string;
  mine: boolean;
};

/** Who sees the note, as a line above its text: the lock when only the trainer does. */
export function NoteVisibility({ visible }: { visible: boolean }) {
  const { t } = useI18n();
  const Icon = visible ? Eye : Lock;
  return (
    <span className="inline-flex items-center gap-1.5 text-footnote text-ink-2">
      <Icon aria-hidden size={14} strokeWidth={2} />
      {visible ? t.pairs.notes.shown : t.pairs.notes.hidden}
    </span>
  );
}

/** One note in the trainer's feed: text, date, who sees it; its author shows, edits or deletes it. */
export function NoteItem({ note }: { note: NoteView }) {
  const { t } = useI18n();
  const copy = t.pairs.notes;
  const [visible, setVisible] = useOptimistic(note.visibleToClient);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      setVisible(next);
      const result = await updateNote({ noteId: note.id, visibleToClient: next });
      if (!result.ok) toast.error(t.pairs.failed);
    });
  }

  function save(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    const problem = bodyError(body, copy);
    setError(problem);
    if (problem) return;
    startTransition(async () => {
      const result = await updateNote({ noteId: note.id, body });
      if (!result.ok) {
        toast.error(t.pairs.failed);
        return;
      }
      setEditing(false);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteNote(note.id);
      if (!result.ok) {
        toast.error(t.pairs.failed);
        return;
      }
      setDeleting(false);
      toast.success(copy.deleted);
    });
  }

  return (
    <article className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <NoteVisibility visible={visible} />
        <span className="text-footnote text-ink-2 tabular-nums">
          {note.createdLabel}
        </span>
      </div>
      {editing ? (
        <form action={save} noValidate className="flex flex-col gap-3">
          <TextArea name="body" label={copy.edit} defaultValue={note.body} error={error} maxLength={NOTE_MAX_LENGTH + 100} autoFocus />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={pending}>
              {copy.save}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(undefined);
              }}
            >
              {copy.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-body break-words whitespace-pre-wrap">{note.body}</p>
      )}
      {note.mine && !editing ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <Switch showLabel label={copy.showToClient} checked={visible} onCheckedChange={toggle} className="min-w-52 flex-1" />
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {copy.edit}
            </Button>
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setDeleting(true)}>
              {copy.delete}
            </Button>
          </div>
        </div>
      ) : null}
      {!note.mine ? <p className="text-footnote text-ink-2">{copy.notMine}</p> : null}
      <Sheet
        open={deleting}
        onOpenChange={(next) => !pending && setDeleting(next)}
        title={copy.deleteTitle}
        description={copy.deleteText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={remove}>
              {copy.delete}
            </Button>
            <Button variant="ghost" size="lg" block disabled={pending} onClick={() => setDeleting(false)}>
              {copy.cancel}
            </Button>
          </>
        }
      />
    </article>
  );
}
