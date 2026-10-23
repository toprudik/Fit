"use client";

import { CircleAlert, Clock } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { DaRing } from "@/components/brand/da-ring";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useI18n } from "@/i18n/client";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { checkIn, checkInByPlace, checkedInSessionStart, type CheckInResult } from "@/lib/check-in/actions";
import { hapticError, hapticSuccess } from "@/lib/telegram/mini-app";

/**
 * /client/checkin/[sessionId] and /client/checkin?place= (PRD wave-3 §5): checks the client in by the scanned QR, a
 * session's code or a location's printed token, as soon as the screen opens. A check-in closes the Da-ring with the
 * Da-moment; a stale code asks to scan again.
 */
export type CheckInTarget = { sessionId: string; code: string } | { place: string };

export function CheckInRun({ target, timeZone }: { target: CheckInTarget; timeZone: string }) {
  const { t, locale } = useI18n();
  const copy = t.checkIn;
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  const run = useCallback(
    () =>
      startTransition(async () => {
        const next = "place" in target ? await checkInByPlace(target.place) : await checkIn(target.sessionId, target.code);
        // A second scan names the session it is already marked on.
        if (next.status === "done" && next.outcome === "already" && next.bookingId) setStartsAt(await checkedInSessionStart(next.bookingId));
        setResult(next);
        // A check-in vibrates with the Da-ring; a request is a success too, everything else an error.
        if (next.status === "done" && next.outcome === "requested") hapticSuccess();
        else if (next.status === "error" || !["checked_in", "already"].includes(next.outcome)) hapticError();
      }),
    [target],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  if (result === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-12" role="status">
        <DaRing state="progress" value={0.25} size={64} />
        <p className="text-body text-ink-2">{copy.checking}</p>
      </div>
    );
  }

  const clock = (at: string) =>
    new Intl.DateTimeFormat(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(at));

  const back = (
    <Button asChild variant="secondary">
      <Link href="/client/sessions">{copy.toSessions}</Link>
    </Button>
  );

  if (result.status === "done" && (result.outcome === "checked_in" || result.outcome === "already")) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <DaRing state="done" size={96} animate={result.outcome === "checked_in"} label={copy.title} />
        <p className="text-title-3">
          {result.outcome === "already" && startsAt ? interpolate(copy.alreadyAt, { time: clock(startsAt) }) : copy.outcomes[result.outcome]}
        </p>
        {back}
      </div>
    );
  }

  if (result.status === "done" && result.outcome === "too_early" && result.opensAt) {
    return (
      <EmptyState icon={Clock} title={copy.title} description={interpolate(copy.outcomes.too_early, { time: clock(result.opensAt) })} action={back} />
    );
  }

  const text =
    result.status === "error"
      ? copy.outcomes.failed
      : result.outcome === "no_booking" && "place" in target
        ? copy.noBookingPlace
        : copy.outcomes[result.outcome === "too_early" ? "closed" : result.outcome];
  return (
    <EmptyState
      icon={CircleAlert}
      title={copy.title}
      description={text}
      action={
        result.status === "error" ? (
          <Button type="button" loading={pending} onClick={run}>
            {copy.retry}
          </Button>
        ) : (
          back
        )
      }
    />
  );
}
