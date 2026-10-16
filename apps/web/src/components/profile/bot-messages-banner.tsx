"use client";

import { BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { setBotMessages } from "@/lib/consent/bot-actions";
import { useInTelegram } from "@/lib/telegram/mini-app";
import { askWriteAccess } from "@/lib/telegram/write-access";

/**
 * "Уведомления выключены" in the profile while the bot cannot write to the user (PRD wave-1 §2.1 rule 6,
 * AUTH-7). In the Mini App "Включить" asks Telegram for permission; on the website the user starts the bot
 * in Telegram and comes back to "Проверить". Either way an allowed answer clears the mark and the bot sends
 * a test message, so the user sees it works. If Telegram still refuses it, the dispatcher sets the mark
 * again and the banner returns.
 */
export function BotMessagesBanner({ botUrl }: { botUrl: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const inTelegram = useInTelegram();
  const [pending, setPending] = useState(false);

  async function enable() {
    setPending(true);
    const status = inTelegram ? await askWriteAccess() : "allowed";
    if (status === "allowed") {
      if (await setBotMessages(true, true)) {
        toast.success(t.consent.bot.enabled);
        router.refresh();
      } else toast.error(t.consent.bot.failed);
    } else if (status === "denied") {
      await setBotMessages(false);
      toast.error(t.consent.bot.refused);
    } else toast.error(t.consent.bot.failed);
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-warning-soft p-4">
      <div className="flex gap-3">
        <BellOff aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-headline">{t.consent.bot.offTitle}</h2>
          <p className="text-subhead text-ink-2">{inTelegram ? t.consent.bot.offText : t.consent.bot.offWebText}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        {inTelegram ? null : (
          <Button asChild variant="secondary" className="md:w-fit">
            <a href={botUrl} target="_blank" rel="noopener noreferrer">
              {t.consent.bot.open}
            </a>
          </Button>
        )}
        <Button variant="secondary" className="md:w-fit" loading={pending} onClick={() => void enable()}>
          {inTelegram ? t.consent.bot.enable : t.consent.bot.check}
        </Button>
      </div>
    </section>
  );
}
