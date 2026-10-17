"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ListGroup } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { TextArea } from "@/components/ui/text-area";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { markAttendance, type AttendanceMark } from "@/lib/passes/attendance";

type Client = { bookingId: string; name: string; status: string };

const MARKS: AttendanceMark[] = ["attended", "no_show", "cancelled"];

/**
 * "Отметить посещение" on /trainer/sessions/[sessionId] after the start (PRD 2.6.6): one row per booked client with
 * Был / Не пришёл / Не состоялось. The last one asks for a reason the client will see.
 */
export function AttendanceMarks({ clients }: { clients: Client[] }) {
  const { t } = useI18n();
  const copy = t.attendance;
  const [marks, setMarks] = useState(() => new Map(clients.map((client) => [client.bookingId, client.status])));
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Client | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (client: Client, mark: AttendanceMark, why: string) => {
    setBusy(client.bookingId);
    startTransition(async () => {
      const result = await markAttendance({ bookingId: client.bookingId, mark, reason: why });
      setBusy(null);
      if (result.status === "done") {
        setMarks((current) => new Map(current).set(client.bookingId, mark));
        setCancelling(null);
        setReason("");
        setError(null);
        toast.success(interpolate(copy.saved[mark], { name: client.name }));
        return;
      }
      const text = copy.errors[result.error];
      if (mark === "cancelled") setError(text);
      else toast.error(text);
    });
  };

  const choose = (client: Client, mark: AttendanceMark) => {
    if (marks.get(client.bookingId) === mark) return;
    if (mark === "cancelled") {
      setCancelling(client);
      setReason("");
      setError(null);
      return;
    }
    save(client, mark, "");
  };

  if (clients.length === 0) return null;

  return (
    <>
      <ListGroup header={copy.title} footer={copy.hint}>
        {clients.map((client) => (
          <div key={client.bookingId} className="flex flex-col gap-2 px-4 py-3">
            <span className="text-body">{client.name}</span>
            <div role="group" aria-label={interpolate(copy.group, { name: client.name })} className="flex flex-wrap gap-2">
              {MARKS.map((mark) => (
                <Chip
                  key={mark}
                  selected={marks.get(client.bookingId) === mark}
                  onClick={pending && busy === client.bookingId ? undefined : () => choose(client, mark)}
                >
                  {copy.marks[mark]}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </ListGroup>
      <Sheet
        open={cancelling !== null}
        onOpenChange={(next) => (next ? null : setCancelling(null))}
        title={copy.cancelTitle}
        description={copy.cancelText}
        actions={
          <>
            <Button
              type="button"
              variant="destructive"
              block
              loading={pending}
              onClick={() => cancelling && (reason.trim() ? save(cancelling, "cancelled", reason) : setError(copy.errors.reason_required))}
            >
              {copy.cancelConfirm}
            </Button>
            <Button type="button" variant="secondary" block onClick={() => setCancelling(null)}>
              {copy.keep}
            </Button>
          </>
        }
      >
        <TextArea
          label={copy.reason}
          hint={copy.reasonHint}
          error={error ?? undefined}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Sheet>
    </>
  );
}
