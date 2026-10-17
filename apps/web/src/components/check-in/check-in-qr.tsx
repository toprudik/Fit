"use client";

import { QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { loadCheckInQr, type CheckInQr as QrState } from "@/lib/check-in/actions";

/** How often the open sheet asks who has checked in: a check-in shows up within 5 seconds (PRD wave-3 5.1). */
const POLL_MS = 5_000;

/**
 * "QR для отметки" on /trainer/sessions/[sessionId] (PRD wave-3 §5 rule 2a): a sheet with the session's code,
 * fetched again when its 15-second window ends, and the clients who have checked in so far.
 */
export function CheckInQr({ sessionId, timeZone }: { sessionId: string; timeZone: string }) {
  const { t, locale } = useI18n();
  const copy = t.checkIn;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<QrState | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seen = -1;
    const tick = async () => {
      const next = await loadCheckInQr(sessionId);
      if (cancelled) return;
      setQr(next);
      if (next.status !== "open") return;
      // A new check-in also changes the attendance marks on the page under the sheet.
      if (seen >= 0 && next.checkedIn.length !== seen) router.refresh();
      seen = next.checkedIn.length;
      const untilRefresh = new Date(next.refreshAt).getTime() - Date.now();
      timer = setTimeout(tick, Math.max(250, Math.min(POLL_MS, untilRefresh + 100)));
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, sessionId, router]);

  const time = (iso: string) => new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));

  return (
    <>
      <ListGroup>
        <ListRow icon={QrCode} iconTone="accent" title={copy.qrRow} subtitle={copy.qrRowText} onClick={() => setOpen(true)} />
      </ListGroup>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQr(null);
        }}
        title={copy.qrTitle}
        description={qr?.status === "open" && qr.qrSvg ? copy.qrText : undefined}
        actions={
          <Button type="button" variant="secondary" block onClick={() => setOpen(false)}>
            {copy.close}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-4">
          {qr === null ? (
            <Skeleton className="aspect-square h-auto w-full max-w-64 rounded-lg" />
          ) : qr.status === "open" ? (
            <>
              {qr.qrSvg ? (
                <div
                  role="img"
                  aria-label={copy.qrLabel}
                  className="aspect-square w-full max-w-64 overflow-hidden rounded-lg bg-white [&>svg]:size-full"
                  // Built on the server by the qrcode package from our own link, not from user input.
                  dangerouslySetInnerHTML={{ __html: qr.qrSvg }}
                />
              ) : (
                <p className="text-body text-ink-2">{interpolate(copy.notOpen, { time: time(qr.opensAt) })}</p>
              )}
              <div className="flex w-full flex-col gap-1" aria-live="polite">
                <span className="text-subhead text-ink-2">{copy.checkedIn}</span>
                <span className="text-body">
                  {qr.checkedIn.length > 0 ? qr.checkedIn.map((client) => client.name || copy.noName).join(", ") : copy.nobody}
                </span>
              </div>
            </>
          ) : (
            <p role="alert" className="text-body text-ink-2">
              {qr.status === "closed" ? copy.closed : copy.failed}
            </p>
          )}
        </div>
      </Sheet>
    </>
  );
}
