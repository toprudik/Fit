"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { deleteDocument } from "@/lib/verification/trainer-actions";

/** "Удалить" with a second press to confirm: the file is gone for good. */
export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const copy = t.verification.documents;
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const { ok } = await deleteDocument(documentId);
      if (ok) toast.success(copy.removed);
      else toast.error(copy.removeFailed);
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button size="sm" variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
        {copy.remove}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="destructive" loading={pending} onClick={remove}>
        {copy.removeConfirm}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        {copy.cancel}
      </Button>
    </div>
  );
}
