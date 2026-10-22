"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { downloadInTelegram, openExternalLink } from "@/lib/telegram/mini-app";

/**
 * Download buttons of a ready archive, one per part. Inside Telegram the file goes through Telegram's own
 * download dialog, as the Mini App's view cannot save it; an older Telegram opens the link in the browser.
 */
export function ExportDownload({ parts }: { parts: string[] }) {
  const { t } = useI18n();
  const copy = t.account.export;
  return (
    <div className="flex flex-wrap gap-2">
      {parts.map((url, index) => (
        <Button key={url} asChild variant="secondary" size="sm" icon={Download}>
          <a
            href={url}
            download
            onClick={(event) => {
              // The names the signed links carry (lib/account/load.ts).
              const fileName = parts.length > 1 ? `dafit-export-${index + 1}.zip` : "dafit-export.zip";
              if (downloadInTelegram(url, fileName) || openExternalLink(url)) event.preventDefault();
            }}
          >
            {parts.length > 1 ? interpolate(copy.downloadPart, { number: String(index + 1) }) : copy.download}
          </a>
        </Button>
      ))}
    </div>
  );
}
