"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { openExternalLink } from "@/lib/telegram/mini-app";
import { STEPS_SHORTCUT_URL } from "./paths";

/** "Установить команду": the ready shortcut on iCloud. Inside Telegram the link has to go through Telegram's own call. */
export function InstallShortcut() {
  const { t } = useI18n();
  return (
    <Button asChild size="lg" block>
      <a
        href={STEPS_SHORTCUT_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (openExternalLink(STEPS_SHORTCUT_URL)) event.preventDefault();
        }}
      >
        <Download aria-hidden />
        {t.activity.shortcut.install}
      </a>
    </Button>
  );
}
