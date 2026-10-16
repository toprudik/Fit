"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { cancelSession } from "@/lib/schedule/session-actions";

/**
 * "Отменить занятие" (PRD 2.6.5): a reason the client sees, no charge. A session of a repeat may take the
 * following ones with it, and the repeat stops.
 */
export function CancelSession({ sessionId, inRepeat }: { sessionId: string; inRepeat: boolean }) {
  const { t } = useI18n();
  const copy = t.schedule.sessionPage;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!reason.trim()) return setError(copy.reasonRequired);
    startTransition(async () => {
      const result = await cancelSession({ sessionId, reason, following });
      if (result.status === "done") {
        setOpen(false);
        toast.success(result.count > 1 ? interpolate(copy.cancelledMany, { count: result.count }) : copy.cancelled);
        router.refresh();
        return;
      }
      setError(result.error === "reason_required" ? copy.reasonRequired : t.schedule.sessionForm.errors[result.error]);
    });
  };

  return (
    <>
      <Button type="button" variant="secondary" block onClick={() => setOpen(true)}>
        {copy.cancel}
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={copy.cancelTitle}
        description={copy.cancelText}
        actions={
          <>
            <Button type="button" variant="destructive" block loading={pending} onClick={confirm}>
              {copy.cancelConfirm}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
              {copy.keep}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {inRepeat ? (
            <SegmentedControl
              label={t.schedule.sessionForm.scope}
              value={following ? "following" : "one"}
              onValueChange={(next) => setFollowing(next === "following")}
              options={[
                { value: "one", label: t.schedule.sessionForm.scopeOne },
                { value: "following", label: t.schedule.sessionForm.scopeFollowing },
              ]}
            />
          ) : null}
          <TextArea
            label={copy.reason}
            hint={copy.reasonHint}
            error={error ?? undefined}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
        </div>
      </Sheet>
    </>
  );
}
