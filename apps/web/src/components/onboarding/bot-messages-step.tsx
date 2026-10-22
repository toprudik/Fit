"use client";

import { Check } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { setBotMessages } from "@/lib/consent/bot-actions";
import { useInTelegram } from "@/lib/telegram/mini-app";
import { askWriteAccess } from "@/lib/telegram/write-access";

/** Telegram's answer survives the reload a language change makes on this step (QA T3). */
const ANSWER_KEY = "dafit-bot-answer";

function savedAnswer(): "allowed" | "denied" | null {
  try {
    const value = window.sessionStorage.getItem(ANSWER_KEY);
    return value === "allowed" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/** Nothing else writes the key while the step is open, so there is nothing to listen to. */
function subscribeNever() {
  return () => {};
}

function saveAnswer(answer: "allowed" | "denied") {
  try {
    window.sessionStorage.setItem(ANSWER_KEY, answer);
  } catch {
    // Storage is off (a private window): the button comes back after a reload, nothing else changes.
  }
}

/**
 * The bot messages part of /onboarding/preferences (PRD wave-1 §2.1 rule 6). In the Mini App it asks
 * Telegram for permission (requestWriteAccess) and records the answer; a denial turns on the banner in
 * the profile. On the website nothing can ask Telegram, so it links to the bot, where "Start" lets the
 * bot write.
 */
export function BotMessagesStep({ botUrl }: { botUrl: string }) {
  const { t } = useI18n();
  const inTelegram = useInTelegram();
  const [answer, setAnswer] = useState<"allowed" | "denied" | null>(null);
  const [pending, setPending] = useState(false);
  // The server render has no storage, so hydration starts from null and then reads the saved answer.
  const saved = useSyncExternalStore(subscribeNever, savedAnswer, () => null);
  const shown = answer ?? saved;

  async function ask() {
    setPending(true);
    const status = await askWriteAccess();
    // No answer (an old client, a failed request): leave the button, nothing is known.
    if (status) {
      await setBotMessages(status === "allowed");
      saveAnswer(status);
      setAnswer(status);
    }
    setPending(false);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline">{t.consent.bot.title}</h2>
        <p className="text-subhead text-ink-2">{inTelegram ? t.consent.bot.text : t.consent.bot.webText}</p>
      </div>
      {shown === "allowed" ? (
        <p role="status" className="flex items-center gap-2 text-subhead text-success">
          <Check aria-hidden className="size-5 shrink-0" />
          {t.consent.bot.allowed}
        </p>
      ) : shown === "denied" ? (
        <p role="status" className="text-subhead text-ink-2">
          {t.consent.bot.denied}
        </p>
      ) : inTelegram ? (
        <Button variant="secondary" block loading={pending} onClick={() => void ask()}>
          {t.consent.bot.allow}
        </Button>
      ) : (
        <Button asChild variant="secondary" block>
          <a href={botUrl} target="_blank" rel="noopener noreferrer">
            {t.consent.bot.open}
          </a>
        </Button>
      )}
    </section>
  );
}
