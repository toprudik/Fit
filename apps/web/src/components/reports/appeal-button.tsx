"use client";

import { Scale } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { appealReport } from "@/lib/reports/actions";
import { REPORT_TEXT_MAX, reportText } from "@/lib/reports/reports";

/** "Обжаловать" a decision (DSA art. 20): why it is wrong; another admin decides and the answer comes to the bot. */
export function AppealButton({ reportId }: { reportId: string }) {
  const { t } = useI18n();
  const copy = t.reports;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const body = reportText(String(formData.get("appeal") ?? ""));
    const problem = body === null ? copy.errors.appeal : body === "long" ? copy.errors.long : undefined;
    setError(problem);
    if (problem || body === null || body === "long") return;
    startTransition(async () => {
      const { status } = await appealReport({ reportId, body });
      if (status === "sent") {
        setOpen(false);
        toast.success(copy.appeal.sent);
      } else if (status === "already") toast.error(copy.appeal.already);
      else if (status === "gone") toast.error(copy.appeal.gone);
      else toast.error(copy.failed);
    });
  }

  return (
    <>
      <Button
        icon={Scale}
        size="sm"
        variant="secondary"
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        {copy.appeal.action}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.appeal.title} description={copy.appeal.text}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <TextArea name="appeal" label={copy.appeal.label} error={error} maxLength={REPORT_TEXT_MAX + 100} />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.appeal.send}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
