"use client";

import { shareURL } from "@tma.js/sdk-react";
import { Copy, Power, PowerOff, Share2, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { archiveTrialLink, setTrialLinkEnabled } from "@/lib/trial-links/actions";
import { safely, useInTelegram } from "@/lib/telegram/mini-app";

export type TrialLinkItem = {
  id: string;
  title: string;
  /** "45 мин, 1 500 ₽, Зал на Тверской", already formatted. */
  terms: string;
  url: string;
  enabled: boolean;
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
        <Badge tone={link.enabled ? "success" : "neutral"} className="shrink-0">
          {link.enabled ? copy.on : copy.off}
        </Badge>
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

/** The trainer's trial links on /trainer/links: share, copy, switch off and on, delete. */
export function TrialLinkList({ links }: { links: TrialLinkItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {links.map((link) => (
        <TrialLinkRow key={link.id} link={link} />
      ))}
    </ul>
  );
}
