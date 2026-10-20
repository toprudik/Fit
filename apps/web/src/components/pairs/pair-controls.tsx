"use client";

import { Archive, ArchiveRestore, LogOut } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { endCoaching, setArchived, setSelfBookOnDebt } from "@/lib/pairs/actions";
import { END_REASON_MAX_LENGTH } from "@/lib/pairs/clients";
import { hapticSuccess } from "@/lib/telegram/mini-app";

const DEBT_LIMITS = ["1", "2", "3", "5"] as const;

/**
 * "Разрешить запись в долг" (Q22): applies at once, off by default. When on, the trainer picks how many unpaid
 * sessions the client may book without confirmation at a time.
 */
export function DebtBookingSwitch({ coachingId, enabled, limit }: { coachingId: string; enabled: boolean; limit: number }) {
  const { t } = useI18n();
  const [optimistic, setOptimistic] = useOptimistic({ enabled, limit });
  const [, startTransition] = useTransition();
  const save = (next: { enabled: boolean; limit: number }) =>
    startTransition(async () => {
      setOptimistic(next);
      const result = await setSelfBookOnDebt({ coachingId, ...next });
      if (!result.ok) toast.error(t.pairs.failed);
    });
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <Switch
        showLabel
        label={t.pairs.debtBooking}
        hint={t.pairs.debtBookingHint}
        checked={optimistic.enabled}
        onCheckedChange={(next) => save({ enabled: next, limit: optimistic.limit })}
      />
      {optimistic.enabled ? (
        <div className="flex flex-col gap-2">
          <p className="text-subhead text-ink-2">{t.pairs.debtLimit}</p>
          <SegmentedControl
            label={t.pairs.debtLimit}
            options={DEBT_LIMITS.map((value) => ({ value, label: value }))}
            value={String(optimistic.limit) as (typeof DEBT_LIMITS)[number]}
            onValueChange={(value) => save({ enabled: true, limit: Number(value) })}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Moves the client to the archive or back to the list; nothing else about the pair changes (PAIR-6). */
export function ArchiveRow({ coachingId, archived }: { coachingId: string; archived: boolean }) {
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  return (
    <ListRow
      icon={archived ? ArchiveRestore : Archive}
      title={archived ? t.pairs.unarchive : t.pairs.archive}
      chevron={false}
      onClick={() => {
        if (pending) return;
        startTransition(async () => {
          const result = await setArchived({ coachingId, archived: !archived });
          if (result.ok) toast.success(archived ? t.pairs.unarchivedToast : t.pairs.archivedToast);
          else toast.error(t.pairs.failed);
        });
      }}
    />
  );
}

type EndPairRowProps = {
  coachingId: string;
  side: "trainer" | "client";
  /** The other side, named in the confirmation. */
  partnerName: string;
};

/**
 * "Завершить работу с клиентом" / "Перестать заниматься у тренера" (PRIV-5): a confirmation sheet with an
 * optional reason, then end_coaching. The card stays open and shows the ended pair.
 */
export function EndPairRow({ coachingId, side, partnerName }: EndPairRowProps) {
  const { t } = useI18n();
  const copy = t.pairs.end;
  const [open, setOpen] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const trainer = side === "trainer";

  function submit(formData: FormData) {
    const reason = String(formData.get("reason") ?? "").trim();
    if (reason.length > END_REASON_MAX_LENGTH) {
      setReasonError(copy.reasonTooLong);
      return;
    }
    setReasonError(undefined);
    startTransition(async () => {
      const result = await endCoaching({ coachingId, reason });
      if (!result.ok) {
        toast.error(t.pairs.failed);
        return;
      }
      hapticSuccess();
      setOpen(false);
      toast.success(trainer ? copy.trainerDone : copy.clientDone);
    });
  }

  return (
    <>
      <ListRow
        icon={LogOut}
        tone="danger"
        title={trainer ? copy.trainerAction : copy.clientAction}
        chevron={false}
        onClick={() => setOpen(true)}
      />
      <Sheet
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={trainer ? copy.trainerTitle : copy.clientTitle}
        description={trainer ? interpolate(copy.trainerText, { name: partnerName }) : copy.clientText}
      >
        <form action={submit} noValidate className="flex flex-col gap-4">
          <TextArea
            name="reason"
            label={copy.reasonLabel}
            hint={copy.reasonHint}
            error={reasonError}
            maxLength={END_REASON_MAX_LENGTH + 100}
            rows={2}
          />
          <div className="flex flex-col gap-2">
            <Button type="submit" variant="destructive" size="lg" block loading={pending}>
              {trainer ? copy.confirm : copy.clientConfirm}
            </Button>
            <Button type="button" variant="ghost" size="lg" block disabled={pending} onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
