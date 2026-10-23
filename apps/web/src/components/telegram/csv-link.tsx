"use client";

import { useState, type ReactNode } from "react";
import { toast } from "@/components/ui/sonner";
import { canDownloadInTelegram, downloadInTelegram } from "@/lib/telegram/mini-app";

/**
 * A CSV download («Аналитика», «Статистика»). On the website it is a plain download link. The Mini App's WebView
 * ignores `download` on Android (QA 22.10), so there a POST to the same `href` stores a copy and answers a signed
 * link for Telegram's own download dialog (lib/account/csv-copy); `failed` is the toast when that does not work.
 */
export function CsvLink({ href, failed, className, children }: { href: string; failed: string; className?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      download
      aria-busy={busy || undefined}
      className={className}
      onClick={async (event) => {
        if (!canDownloadInTelegram()) return;
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          const response = await fetch(href, { method: "POST" });
          const file: { url?: string; fileName?: string } | null = response.ok ? await response.json() : null;
          if (!file?.url || !file.fileName || !downloadInTelegram(file.url, file.fileName)) toast.error(failed);
        } catch {
          toast.error(failed);
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </a>
  );
}
