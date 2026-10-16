"use client";

import { FileUp, Plus } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { TextField } from "@/components/ui/text-field";
import { useI18n } from "@/i18n/client";
import { uploadToSignedUrl } from "@/lib/supabase/upload";
import { DOCUMENT_ACCEPT, documentProblem, MAX_TITLE_LENGTH } from "@/lib/verification/documents";
import { prepareDocumentUpload, saveDocument } from "@/lib/verification/trainer-actions";

type Errors = { title?: string; file?: string; form?: string };

/**
 * "Добавить документ": a title and one file. The file goes straight from the browser to Storage through a
 * one-time URL, then the server saves its row (lib/verification/trainer-actions).
 */
export function DocumentUploadForm() {
  const { t } = useI18n();
  const copy = t.verification.documents;
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileNoteId = useId();

  function close() {
    setOpen(false);
    setFile(null);
    setErrors({});
  }

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!picked) return;
    const problem = documentProblem(picked);
    setErrors((previous) => ({
      ...previous,
      file: problem === "wrong-type" ? copy.wrongType : problem === "too-big" ? copy.tooBig : problem === "empty" ? copy.emptyFile : undefined,
    }));
    setFile(problem ? null : picked);
  }

  function upload(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    const next: Errors = { title: title ? undefined : copy.titleEmpty, file: file ? errors.file : (errors.file ?? copy.fileEmpty) };
    setErrors(next);
    if (!file || next.title || next.file) return;

    startTransition(async () => {
      const prepared = await prepareDocumentUpload({ title, type: file.type, size: file.size });
      if (prepared.status !== "ready") {
        setErrors({ form: prepared.status === "limit" ? copy.limit : copy.uploadFailed });
        return;
      }
      const uploaded = await uploadToSignedUrl("certificates", prepared.path, prepared.token, file);
      const saved = uploaded ? await saveDocument({ id: prepared.id, path: prepared.path, title }) : { status: "failed" as const };
      if (saved.status === "saved") {
        toast.success(copy.uploaded);
        close();
      } else {
        setErrors({ form: saved.status === "limit" ? copy.limit : copy.uploadFailed });
      }
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" icon={Plus} className="self-start" onClick={() => setOpen(true)}>
        {copy.add}
      </Button>
    );
  }

  return (
    <form action={upload} noValidate className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <TextField name="title" label={copy.titleLabel} hint={copy.titleHint} error={errors.title} maxLength={MAX_TITLE_LENGTH} autoComplete="off" />
      <div className="flex flex-col gap-1.5">
        <span className="px-1 text-footnote text-ink-2">{copy.file}</span>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={FileUp}
            aria-describedby={errors.file || file ? fileNoteId : undefined}
            onClick={() => fileInput.current?.click()}
          >
            {file ? copy.chooseOther : copy.choose}
          </Button>
          {file ? <span className="min-w-0 text-subhead break-all text-ink">{file.name}</span> : null}
        </div>
        {errors.file ? (
          <p id={fileNoteId} className="px-1 text-footnote text-danger">
            {errors.file}
          </p>
        ) : null}
        <input ref={fileInput} type="file" accept={DOCUMENT_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={pick} />
      </div>
      {errors.form ? (
        <p role="alert" className="text-subhead text-danger">
          {errors.form}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {copy.upload}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={close}>
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}
