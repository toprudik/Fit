"use client";

import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { shareInTelegram } from "@/lib/share/share-link";
import { useInTelegram } from "@/lib/telegram/mini-app";

/**
 * A referral link with "Поделиться" (inside the Mini App a prepared message with an "Открыть" button, see
 * shareInTelegram) and "Скопировать": the client's
 * one by default, or a trainer's invitation for trainers with its own share text.
 */
export function ReferralShare({ link, shareText }: { link: string; shareText?: string }) {
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

  async function share() {
    const text = shareText ?? copy.shareText;
    if (inTelegram && (await shareInTelegram(link, text))) return;
    if (typeof navigator.share === "function") {
      navigator.share({ url: link, text }).catch(() => undefined);
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
        <Button size="sm" icon={Share2} onClick={() => void share()}>
          {copy.share}
        </Button>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copyLink()}>
          {copy.copy}
        </Button>
      </div>
    </div>
  );
}
