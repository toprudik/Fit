"use client";

import { Hourglass } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import type { SessionWaitlistEntry } from "@/lib/schedule/load";
import { offerWaitlistSeat, type OfferSeatResult } from "@/lib/schedule/session-actions";

type Props = {
  entries: (SessionWaitlistEntry & { offeredUntil: string | null })[];
  /** Offers can go out only while the session is ahead and has a free seat. */
  canOffer: boolean;
  /** The list header; "Очередь" by default, a slot's time on the slots page. */
  header?: string;
};

/** The queue of a group session or a free slot for the trainer (PRD wave-2 §9.6, §9-7), with "Предложить место". */
export function WaitlistQueue({ entries, canOffer, header }: Props) {
  const { t } = useI18n();
  const copy = t.schedule.waitlist;
  const [error, setError] = useState<Extract<OfferSeatResult, { status: "error" }>["error"] | null>(null);
  const [pending, startTransition] = useTransition();
  const [offering, setOffering] = useState<string | null>(null);

  const offer = (entryId: string) => {
    setError(null);
    setOffering(entryId);
    startTransition(async () => {
      const result = await offerWaitlistSeat(entryId);
      if (result.status === "error") return setError(result.error);
      toast.success(copy.offerSent);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <ListGroup header={header ?? copy.queue}>
        {entries.map((entry) => (
          <ListRow
            key={entry.id}
            icon={Hourglass}
            title={entry.name}
            subtitle={
              entry.status === "offered"
                ? interpolate(copy.queueOffered, { time: entry.offeredUntil ?? "" })
                : interpolate(copy.queueWaiting, { place: String(entry.place ?? 1) })
            }
            trailing={
              canOffer && entry.status === "waiting" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={pending && offering === entry.id}
                  disabled={pending}
                  onClick={() => offer(entry.id)}
                >
                  {copy.offerSeat}
                </Button>
              ) : undefined
            }
          />
        ))}
      </ListGroup>
      {error ? (
        <p role="alert" className="px-1 text-subhead text-danger">
          {copy.trainerErrors[error]}
        </p>
      ) : null}
    </div>
  );
}
