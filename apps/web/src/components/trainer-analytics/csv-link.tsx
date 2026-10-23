"use client";

import { useState, type ReactNode } from "react";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { canDownloadInTelegram, downloadInTelegram } from "@/lib/telegram/mini-app";

/**
 * A CSV of «Аналитика». On the website it is a plain download link. The Mini App's WebView ignores `download`
 * on Android (QA 22.10), so there the route stores a copy and answers a signed link for Telegram's own download
 * dialog (POST /api/trainer/export/[kind]).
 */
export function CsvLink({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      download
      aria-busy={busy || undefined}
      className="after:absolute after:inset-0"
      onClick={async (event) => {
        if (!canDownloadInTelegram()) return;
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const response = await fetch(href, { method: "POST" });
          const file: { url?: string; fileName?: string } | null = response.ok ? await response.json() : null;
          if (!file?.url || !file.fileName || !downloadInTelegram(file.url, file.fileName)) toast.error(t.trainerAnalytics.csv.failed);
        } catch {
          toast.error(t.trainerAnalytics.csv.failed);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </a>
  );
}
