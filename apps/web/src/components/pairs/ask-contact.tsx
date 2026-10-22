"use client";

import { MessageCircleQuestion } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { askToContact } from "@/lib/contact/actions";
import { nextContactRequestAt } from "@/lib/contact/request";
import { formatSessionTime } from "@/lib/pairs/format";
import { hapticSuccess } from "@/lib/telegram/mini-app";

type Props = {
  coachingId: string;
  /** The viewer's last request to this person, for the 24-hour pause. */
  requestedAt: string | null;
  timeZone: string;
  /** `row`: a list row with the words, as on the client's card of a trainer. */
  variant?: "icon" | "row";
};

/**
 * "Попросить связаться" in a pair's header when the other side has no Telegram username (PRIV-2): a sheet
 * explains what happens, then request_contact. Within 24 hours of the last request the sheet only says when
 * the next one is possible. The time is worked out when the sheet opens, never during render.
 */
export function AskContactButton({ coachingId, requestedAt, timeZone, variant = "icon" }: Props) {
  const { t, locale } = useI18n();
  const copy = t.pairs.contact;
  const [open, setOpen] = useState(false);
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  function show() {
    setNextAt(nextContactRequestAt(requestedAt));
    setOpen(true);
  }

  function ask() {
    startTransition(async () => {
      const result = await askToContact(coachingId);
      if (result.status === "sent") {
        hapticSuccess();
        setOpen(false);
        toast.success(copy.sent);
      } else if (result.status === "error" && result.reason === "too_soon") {
        setNextAt(nextContactRequestAt(new Date().toISOString()));
      } else {
        toast.error(result.reason === "unavailable" ? copy.unavailable : t.pairs.failed);
      }
    });
  }

  return (
    <>
      {variant === "row" ? (
        <ListRow icon={MessageCircleQuestion} title={copy.action} onClick={show} />
      ) : (
        <IconButton icon={MessageCircleQuestion} label={copy.action} onClick={show} />
      )}
      <Sheet open={open} onOpenChange={(next) => !pending && setOpen(next)} title={copy.title} description={copy.text}>
        <div className="flex flex-col gap-4">
          {nextAt ? (
            <p className="text-body text-ink-2">
              {interpolate(copy.waiting, { time: formatSessionTime(locale, nextAt.toISOString(), timeZone) })}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            {nextAt ? null : (
              <Button size="lg" block loading={pending} onClick={ask}>
                {copy.confirm}
              </Button>
            )}
            <Button variant="ghost" size="lg" block disabled={pending} onClick={() => setOpen(false)}>
              {nextAt ? copy.close : copy.cancel}
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
