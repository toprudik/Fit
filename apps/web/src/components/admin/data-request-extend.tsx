"use client";

import { CalendarClock } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { extendDataRequest } from "@/lib/feedback/admin-actions";
import { MAX_EXTENSION_REASON } from "@/lib/feedback/data-requests";

/** "Продлить на 5 рабочих дней": once per data request, with a reason the author gets in the bot (152-FZ art. 20). */
export function DataRequestExtend({ id }: { id: string }) {
  const { t } = useI18n();
  const copy = t.adminFeedback.request;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!reason) return setError(copy.reasonEmpty);
    setError(undefined);
    startTransition(async () => {
      const { status } = await extendDataRequest({ id, reason });
      if (status === "extended") {
        setOpen(false);
        toast.success(copy.extended);
      } else if (status === "already") toast.error(copy.already);
      else if (status === "closed") toast.error(copy.closed);
      else if (status === "author_deleted") toast.error(t.adminFeedback.replyDeleted);
      else toast.error(copy.failed);
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" icon={CalendarClock} className="self-start" onClick={() => setOpen(true)}>
        {copy.extend}
      </Button>
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.extendTitle} description={copy.extendText}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(new FormData(event.currentTarget));
          }}
        >
          <TextArea name="reason" label={copy.reason} error={error} maxLength={MAX_EXTENSION_REASON} rows={3} />
          <Button type="submit" size="lg" block loading={pending}>
            {copy.extendSend}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
