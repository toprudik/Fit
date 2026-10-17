"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { interpolate } from "@/i18n/format";
import { openExternalLink } from "@/lib/telegram/mini-app";

/**
 * Download buttons of a ready archive, one per part. Inside Telegram the link opens in the browser, which
 * saves the file; the Mini App's own view cannot.
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
              if (openExternalLink(url)) event.preventDefault();
            }}
          >
            {parts.length > 1 ? interpolate(copy.downloadPart, { number: String(index + 1) }) : copy.download}
          </a>
        </Button>
      ))}
    </div>
  );
}
