"use client";

import { shareURL } from "@tma.js/sdk-react";
import { Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { safely, useInTelegram } from "@/lib/telegram/mini-app";

/**
 * "Поделиться ссылкой": Telegram's chat picker inside the Mini App (shareURL), the system share
 * sheet where the browser has one, otherwise the link goes to the clipboard.
 */
export function ShareClientLink({ link }: { link: string }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.done;
  const inTelegram = useInTelegram();

  async function share() {
    if (inTelegram && safely(() => shareURL.isAvailable())) {
      safely(() => shareURL(link, copy.shareText));
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url: link, text: copy.shareText });
        return;
      } catch (error) {
        // Closing the share sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.success(copy.copied);
    } catch {
      toast.error(copy.copyFailed);
    }
  }

  return (
    <Button size="lg" block icon={Share} onClick={() => void share()}>
      {copy.share}
    </Button>
  );
}
