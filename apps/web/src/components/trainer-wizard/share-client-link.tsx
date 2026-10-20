"use client";

import { Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { shareInTelegram } from "@/lib/share/share-link";
import { useInTelegram } from "@/lib/telegram/mini-app";

/**
 * "Поделиться ссылкой": Telegram's chat picker inside the Mini App (shareInTelegram), the system share
 * sheet where the browser has one, otherwise the link goes to the clipboard. The showcase passes its
 * own button label and message.
 */
export function ShareClientLink({ link, label, text }: { link: string; label?: string; text?: string }) {
  const { t } = useI18n();
  const copy = t.trainerWizard.done;
  const inTelegram = useInTelegram();
  const message = text ?? copy.shareText;

  async function share() {
    if (inTelegram && (await shareInTelegram(link, message))) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ url: link, text: message });
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
      {label ?? copy.share}
    </Button>
  );
}
