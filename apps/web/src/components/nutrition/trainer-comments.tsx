"use client";

import { Pencil, Send, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { COMMENT_MAX } from "@/lib/nutrition/diary";
import type { DayComment } from "@/lib/nutrition/diary-load";
import { addComment, deleteComment, editComment } from "@/lib/nutrition/diary-actions";

const valid = (body: string) => body.trim().length > 0 && body.trim().length <= COMMENT_MAX;

/** The trainer's comments on a day of the client's diary (§3.11–3.14): write, edit and delete own comments. */
export function TrainerComments({ coachingId, day, comments, me }: { coachingId: string; day: string; comments: DayComment[]; me: string }) {
  const { t } = useI18n();
  const copy = t.foodDiary.trainer;
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<DayComment | null>(null);
  const [pending, startTransition] = useTransition();

  function send(body: string) {
    if (!valid(body)) {
      setError(copy.errors.body);
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await addComment(coachingId, day, body);
      if (!result.ok) {
        toast.error(t.foodDiary.failed);
        return;
      }
      form.current?.reset();
      toast.success(copy.sent);
    });
  }

  function remove(comment: DayComment) {
    startTransition(async () => {
      const result = await deleteComment(comment.id);
      if (!result.ok) toast.error(t.foodDiary.failed);
      else toast.success(copy.deleted);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {comments.map((comment) => (
        <article key={comment.id} className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
          <p className="text-body whitespace-pre-line">{comment.body}</p>
          {comment.authorId === me ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={Pencil} disabled={pending} onClick={() => setEditing(comment)}>
                {copy.edit}
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} disabled={pending} onClick={() => remove(comment)}>
                {copy.delete}
              </Button>
            </div>
          ) : null}
        </article>
      ))}
      <form
        ref={form}
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(String(new FormData(event.currentTarget).get("body") ?? ""));
        }}
      >
        <TextArea name="body" label={copy.commentLabel} hint={copy.commentHint} error={error} maxLength={COMMENT_MAX} rows={3} />
        <Button type="submit" icon={Send} loading={pending} className="self-start">
          {copy.send}
        </Button>
      </form>
      {editing ? <EditComment comment={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EditComment({ comment, onClose }: { comment: DayComment; onClose: () => void }) {
  const { t } = useI18n();
  const copy = t.foodDiary.trainer;
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <Sheet open onOpenChange={(next) => !next && !pending && onClose()} title={copy.editTitle}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const body = String(new FormData(event.currentTarget).get("body") ?? "");
          if (!valid(body)) {
            setError(copy.errors.body);
            return;
          }
          startTransition(async () => {
            const result = await editComment(comment.id, body);
            if (!result.ok) {
              toast.error(t.foodDiary.failed);
              return;
            }
            toast.success(t.foodDiary.editor.saved);
            onClose();
          });
        }}
      >
        <TextArea name="body" label={copy.commentLabel} defaultValue={comment.body} error={error} maxLength={COMMENT_MAX} rows={4} />
        <Button type="submit" size="lg" block loading={pending}>
          {copy.save}
        </Button>
      </form>
    </Sheet>
  );
}
