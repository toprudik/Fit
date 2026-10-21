"use client";

import { Ban, Check, EyeOff } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { decideReport } from "@/lib/reports/actions";
import { REPORT_TEXT_MAX, reportText } from "@/lib/reports/reports";

type Action = "keep" | "hide" | "dismiss";

/**
 * "Оставить", "Скрыть" or "Отклонить" a report (DSA art. 17): each asks for the reason both sides get. An appeal
 * can't be dismissed, only kept or hidden.
 */
export function ReportDecision({ reportId, appeal }: { reportId: string; appeal: boolean }) {
  const { t } = useI18n();
  const copy = t.reports.admin;
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    if (!action) return;
    const reason = reportText(String(formData.get("reason") ?? ""));
    const problem = reason === null ? t.adminReviews.errors.reason : reason === "long" ? t.reports.errors.long : undefined;
    setError(problem);
    if (problem || reason === null || reason === "long") return;
    startTransition(async () => {
      const { status } = await decideReport({ reportId, action, reason });
      if (status === "done") toast.success(copy.done);
      else if (status === "closed") toast.error(copy.closed);
      else if (status === "same_admin") toast.error(copy.sameAdmin);
      else toast.error(copy.failed);
      if (status === "done" || status === "closed") setAction(null);
    });
  }

  const actions: { id: Action; icon: typeof Check; variant: "primary" | "secondary" | "ghost" }[] = [
    { id: "keep", icon: Check, variant: "primary" },
    { id: "hide", icon: EyeOff, variant: "secondary" },
    ...(appeal ? [] : [{ id: "dismiss" as const, icon: Ban, variant: "ghost" as const }]),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ id, icon, variant }) => (
        <Button
          key={id}
          icon={icon}
          variant={variant}
          disabled={pending}
          onClick={() => {
            setError(undefined);
            setAction(id);
          }}
        >
          {copy[id]}
        </Button>
      ))}
      <Sheet
        open={action !== null}
        onOpenChange={(next) => !pending && !next && setAction(null)}
        title={action ? copy.reasonTitle[action] : ""}
        description={copy.reasonHint}
      >
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <TextArea name="reason" label={copy.reasonLabel} error={error} maxLength={REPORT_TEXT_MAX + 100} />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.confirm}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}
