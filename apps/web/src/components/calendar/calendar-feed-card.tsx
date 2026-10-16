"use client";

import { openLink } from "@tma.js/sdk-react";
import { CalendarPlus, Copy, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { createCalendarFeed, type CreateFeedResult, type FeedZone } from "@/lib/calendar/actions";
import { hapticSuccess, safely, useInTelegram } from "@/lib/telegram/mini-app";

type Urls = Extract<CreateFeedResult, { ok: true }>["urls"];

type CalendarFeedCardProps = {
  zone: FeedZone;
  /** The active feed, its dates already formatted; null when the zone has none. */
  feed: { created: string; lastFetch: string } | null;
};

/**
 * The calendar feed of one zone (PRD 2.7, screens.md /settings/calendar). Without a feed: "Подключить
 * календарь". Right after creating one the link shows once, with "Копировать" and the Google and Apple
 * buttons (CAL-6). Later only the status stays, and "Перевыпустить ссылку" asks first (Q62).
 */
export function CalendarFeedCard({ zone, feed }: CalendarFeedCardProps) {
  const { t } = useI18n();
  const copy = t.calendar;
  const inTelegram = useInTelegram();
  const [urls, setUrls] = useState<Urls | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingId = `calendar-${zone}`;

  function create() {
    startTransition(async () => {
      const result = await createCalendarFeed(zone);
      if (!result.ok) {
        toast.error(copy.failed);
        return;
      }
      hapticSuccess();
      setUrls(result.urls);
      setConfirmOpen(false);
    });
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  function openGoogle(link: string) {
    // Telegram opens outside links in the browser only through its own call.
    if (inTelegram && safely(() => openLink.isAvailable())) safely(() => openLink(link));
    else window.open(link, "_blank", "noopener");
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={headingId} className="text-headline">
          {copy.zones[zone]}
        </h2>
        <p className="text-callout text-ink-2">{copy.zoneHints[zone]}</p>
      </div>

      {urls ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-footnote text-ink-2">{copy.linkLabel}</p>
            <p className="text-subhead break-all select-all" data-testid="calendar-feed-link">
              {urls.https}
            </p>
          </div>
          <p className="text-footnote text-ink-2">{copy.linkOnce}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" icon={Copy} onClick={() => void copyLink(urls.https)}>
              {copy.copy}
            </Button>
            <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => openGoogle(urls.google)}>
              {copy.addGoogle}
            </Button>
            <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => window.location.assign(urls.webcal)}>
              {copy.addApple}
            </Button>
          </div>
        </div>
      ) : feed ? (
        <div className="flex flex-col gap-0.5">
          <p className="text-subhead font-semibold">{copy.connected}</p>
          <p className="text-footnote text-ink-2">{feed.created}</p>
          <p className="text-footnote text-ink-2">{feed.lastFetch}</p>
        </div>
      ) : null}

      {feed || urls ? (
        <Button variant="ghost" icon={RefreshCw} className="self-start" onClick={() => setConfirmOpen(true)}>
          {copy.reissue}
        </Button>
      ) : (
        <Button className="self-start" icon={CalendarPlus} loading={pending} onClick={create}>
          {copy.connect}
        </Button>
      )}

      <Sheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={copy.reissueTitle}
        description={copy.reissueText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={pending} onClick={create}>
              {copy.reissueConfirm}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setConfirmOpen(false)}>
              {copy.cancel}
            </Button>
          </>
        }
      />
    </section>
  );
}
