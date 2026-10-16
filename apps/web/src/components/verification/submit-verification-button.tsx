"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { submitVerification } from "@/lib/verification/trainer-actions";

/** "Отправить на проверку" (first time) or "Отправить снова" (after a rejection). */
export function SubmitVerificationButton({ again, hasDocuments }: { again: boolean; hasDocuments: boolean }) {
  const { t } = useI18n();
  const copy = t.verification.submit;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const { status } = await submitVerification();
      if (status === "submitted") {
        setError(null);
        toast.success(copy.done);
      } else {
        setError(status === "no-documents" ? copy.needDocuments : copy.failed);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error || !hasDocuments ? (
        <p role={error ? "alert" : undefined} className={error ? "text-subhead text-danger" : "text-subhead text-ink-2"}>
          {error ?? copy.needDocuments}
        </p>
      ) : null}
      <Button size="lg" block loading={pending} disabled={!hasDocuments} onClick={submit}>
        {again ? copy.again : copy.first}
      </Button>
    </div>
  );
}
