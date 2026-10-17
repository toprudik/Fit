"use client";

import { PhoneOff, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { declineContact, shareContact } from "@/lib/contact/actions";
import type { ContactRequestStatus } from "@/lib/contact/request";
import { askTelegramContact } from "@/lib/telegram/contact";
import { hapticSuccess, useInTelegram } from "@/lib/telegram/mini-app";

type Props = {
  requestId: string;
  name: string;
  status: ContactRequestStatus;
  /** The same screen in the Mini App, where Telegram can share the contact. */
  telegramHref: string;
};

/**
 * The answer to "Попросить связаться" (PRIV-2, С1): share the contact through Telegram's own popup, or say no.
 * Telegram shares the number only inside the Mini App, so the website offers to open it there; saying no works
 * anywhere. Once answered, the screen says what happened.
 */
export function ContactAnswer({ requestId, name, status: initial, telegramHref }: Props) {
  const { t } = useI18n();
  const copy = t.contactRequest;
  const inTelegram = useInTelegram();
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function share() {
    setError(null);
    startTransition(async () => {
      const signed = await askTelegramContact();
      if (!signed) {
        setError(copy.notShared);
        return;
      }
      const result = await shareContact(requestId, signed);
      if (result.status === "failed") return setError(copy.failed);
      if (result.status === "accepted") hapticSuccess();
      setStatus(result.status);
    });
  }

  function decline() {
    setError(null);
    startTransition(async () => {
      const result = await declineContact(requestId);
      if (result.status === "failed") return setError(copy.failed);
      setStatus(result.status);
    });
  }

  if (status !== "pending") {
    return (
      <p role="status" className="rounded-lg bg-surface-1 p-4 text-callout text-ink-2">
        {interpolate(copy.done[status], { name })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body text-ink-2">{copy.text}</p>
      {inTelegram ? null : <p className="text-subhead text-ink-2">{copy.telegramOnly}</p>}
      {error ? (
        <p role="alert" className="text-subhead text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 md:flex-row">
        {inTelegram ? (
          <Button size="lg" icon={Share2} loading={pending} onClick={share}>
            {copy.share}
          </Button>
        ) : (
          <Button asChild size="lg">
            <a href={telegramHref}>{copy.openTelegram}</a>
          </Button>
        )}
        <Button variant="ghost" size="lg" icon={PhoneOff} disabled={pending} onClick={decline}>
          {copy.decline}
        </Button>
      </div>
    </div>
  );
}
