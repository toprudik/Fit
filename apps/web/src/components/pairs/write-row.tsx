"use client";

import { MessageCircle } from "lucide-react";
import { ListRow } from "@/components/ui/list";
import { useI18n } from "@/i18n/client";
import { openExternalLink } from "@/lib/telegram/mini-app";

/** "Написать" as a row with the words: opens the trainer's Telegram chat, outside the Mini App when inside it. */
export function WriteRow({ username }: { username: string }) {
  const { t } = useI18n();
  const url = `https://t.me/${encodeURIComponent(username)}`;
  return (
    <ListRow
      icon={MessageCircle}
      title={t.pairs.write}
      onClick={() => {
        if (!openExternalLink(url)) window.open(url, "_blank", "noopener,noreferrer");
      }}
    />
  );
}
