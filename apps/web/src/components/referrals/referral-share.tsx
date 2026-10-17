"use client";

import { shareURL } from "@tma.js/sdk-react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { safely, useInTelegram } from "@/lib/telegram/mini-app";

/** The client's referral link with "Поделиться" (Telegram's share sheet inside the Mini App) and "Скопировать". */
export function ReferralShare({ link }: { link: string }) {
  const { t } = useI18n();
  const copy = t.referrals.client;
  const inTelegram = useInTelegram();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  function share() {
    if (inTelegram && safely(() => shareURL.isAvailable())) {
      safely(() => shareURL(link, copy.shareText));
    } else if (typeof navigator.share === "function") {
      navigator.share({ url: link, text: copy.shareText }).catch(() => undefined);
    } else {
      void copyLink();
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-footnote text-ink-2">{copy.link}</span>
        <span className="text-subhead break-all select-all">{link}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Share2} onClick={share}>
          {copy.share}
        </Button>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copyLink()}>
          {copy.copy}
        </Button>
      </div>
    </div>
  );
}
