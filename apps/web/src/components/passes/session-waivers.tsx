"use client";

import { User } from "lucide-react";
import { useState } from "react";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n/client";
import { WaiveForm, type WaiveTarget } from "./charge-forms";

type ChargedClient = { bookingId: string; name: string; status: string; chargeId: string; passTitle: string | null };

/**
 * "Простить" on /trainer/sessions/[sessionId] (PRD 2.6.6-4, screens.md §4.3): the charged bookings of the session,
 * each with the waiver sheet. ?action=waive&booking=<id> from the late-cancellation message opens it at once.
 */
export function SessionWaivers({ clients, openBookingId }: { clients: ChargedClient[]; openBookingId: string | null }) {
  const { t } = useI18n();
  const copy = t.attendance;
  const [target, setTarget] = useState<WaiveTarget | null>(() => {
    const client = clients.find((candidate) => candidate.bookingId === openBookingId);
    return client ? { chargeId: client.chargeId, passTitle: client.passTitle } : null;
  });
  if (clients.length === 0) return null;
  const status = t.schedule.clientSessions.status as Record<string, string>;

  return (
    <>
      <ListGroup header={copy.charges}>
        {clients.map((client) => (
          <ListRow
            key={client.chargeId}
            icon={User}
            title={client.name}
            subtitle={status[client.status] ?? undefined}
            value={copy.waive}
            onClick={() => setTarget({ chargeId: client.chargeId, passTitle: client.passTitle })}
          />
        ))}
      </ListGroup>
      <Sheet open={target !== null} onOpenChange={(next) => (next ? null : setTarget(null))} title={t.money.passes.waiveForm.title}>
        {target ? <WaiveForm key={target.chargeId} target={target} onDone={() => setTarget(null)} /> : null}
      </Sheet>
    </>
  );
}
