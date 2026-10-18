"use client";

import { shareURL } from "@tma.js/sdk-react";
import { Copy, Power, PowerOff, Share2, Store, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { archiveTrialLink, setTrialLinkEnabled, setTrialLinkOnShowcase } from "@/lib/trial-links/actions";
import { safely, useInTelegram } from "@/lib/telegram/mini-app";

export type TrialLinkItem = {
  id: string;
  title: string;
  /** "45 мин, 1 500 ₽, Зал на Тверской", already formatted. */
  terms: string;
  url: string;
  enabled: boolean;
  /** Behind "Записаться на пробное" on the trainer's showcase. */
  onShowcase: boolean;
  uses: number;
};

function TrialLinkRow({ link }: { link: TrialLinkItem }) {
  const { t } = useI18n();
  const copy = t.trialLinks.trainer;
  const inTelegram = useInTelegram();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  function share() {
    if (inTelegram && safely(() => shareURL.isAvailable())) {
      safely(() => shareURL(link.url, copy.shareText));
    } else if (typeof navigator.share === "function") {
      navigator.share({ url: link.url, text: copy.shareText }).catch(() => undefined);
    } else {
      void copyLink();
    }
  }

  function run(action: () => Promise<{ failed: boolean }>, after?: () => void) {
    startTransition(async () => {
      const { failed } = await action();
      if (failed) {
        toast.error(copy.actionFailed);
        return;
      }
      after?.();
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-headline break-words">{link.title}</h3>
          <p className="text-subhead text-ink-2">{link.terms}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={link.enabled ? "success" : "neutral"}>{link.enabled ? copy.on : copy.off}</Badge>
          {link.onShowcase ? <Badge tone="accent">{copy.onShowcase}</Badge> : null}
        </div>
      </div>
      <p className="text-footnote break-all text-ink-2 select-all">{link.url}</p>
      <p className="text-footnote text-ink-2 tabular-nums">{interpolate(copy.uses, { count: link.uses })}</p>
      <div className="flex flex-wrap gap-2">
        {link.enabled ? (
          <>
            <Button size="sm" icon={Share2} onClick={share}>
              {copy.share}
            </Button>
            <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copyLink()}>
              {copy.copy}
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          icon={link.enabled ? PowerOff : Power}
          loading={pending && !removeOpen}
          onClick={() => run(() => setTrialLinkEnabled(link.id, !link.enabled))}
        >
          {link.enabled ? copy.disable : copy.enable}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={Store}
          disabled={pending}
          onClick={() => run(() => setTrialLinkOnShowcase(link.id, !link.onShowcase))}
        >
          {link.onShowcase ? copy.hideFromShowcase : copy.showOnShowcase}
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setRemoveOpen(true)}>
          {copy.remove}
        </Button>
      </div>

      <Sheet
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={copy.removeTitle}
        description={copy.removeText}
        actions={
          <>
            <Button
              variant="destructive"
              size="lg"
              block
              loading={pending}
              onClick={() => run(() => archiveTrialLink(link.id), () => setRemoveOpen(false))}
            >
              {copy.remove}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setRemoveOpen(false)}>
              {copy.cancel}
            </Button>
          </>
        }
      />
    </li>
  );
}

/** The trainer's trial links on /trainer/links: share, copy, switch off and on, put on the showcase, delete. */
export function TrialLinkList({ links }: { links: TrialLinkItem[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <TrialLinkRow key={link.id} link={link} />
        ))}
      </ul>
      <p className="px-1 text-footnote text-ink-2">{t.trialLinks.trainer.showcaseHint}</p>
    </div>
  );
}
