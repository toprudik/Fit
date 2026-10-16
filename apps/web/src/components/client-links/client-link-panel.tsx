"use client";

import { shareURL } from "@tma.js/sdk-react";
import { Copy, Maximize2, RefreshCw, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { reissueClientLink } from "@/lib/client-links/actions";
import { safely, useInTelegram } from "@/lib/telegram/mini-app";

type ClientLinkPanelProps = {
  link: string;
  code: string;
  /** Generated on the server from `link` by the qrcode package, not from user input. */
  qrSvg: string;
  /** "Пришли по ссылке и коду", already formatted. */
  uses: string;
};

async function copy(text: string, done: string, failed: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(failed);
  }
}

function Qr({ svg, label, className }: { svg: string; label: string; className: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={`shrink-0 overflow-hidden rounded-sm bg-white [&>svg]:size-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * "QR и ссылки" (screens.md §2.2 /trainer/links): the QR to show at the gym, full size on demand,
 * the link and code to copy or share, how many clients came by them, and "Перевыпустить ссылку"
 * behind a confirmation (SHOP-3).
 */
export function ClientLinkPanel({ link, code, qrSvg, uses }: ClientLinkPanelProps) {
  const { t } = useI18n();
  const copyT = t.clientLinks.trainer;
  const inTelegram = useInTelegram();
  const [qrOpen, setQrOpen] = useState(false);
  const [reissueOpen, setReissueOpen] = useState(false);
  const [reissuing, startReissue] = useTransition();

  function share() {
    if (inTelegram && safely(() => shareURL.isAvailable())) {
      safely(() => shareURL(link, copyT.shareText));
    } else if (typeof navigator.share === "function") {
      navigator.share({ url: link, text: copyT.shareText }).catch(() => undefined);
    } else {
      void copy(link, copyT.copied, copyT.copyFailed);
    }
  }

  function reissue() {
    startReissue(async () => {
      const { failed } = await reissueClientLink();
      if (failed) {
        toast.error(copyT.reissueFailed);
        return;
      }
      setReissueOpen(false);
      toast.success(copyT.reissued);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Qr svg={qrSvg} label={copyT.qr} className="size-48" />
        <dl className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-footnote text-ink-2">{copyT.link}</dt>
            <dd className="text-subhead break-all select-all">{link}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-footnote text-ink-2">{copyT.code}</dt>
            <dd className="text-title-2 tracking-widest tabular-nums select-all">{code}</dd>
            <dd className="text-footnote text-ink-2">{copyT.codeHint}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-footnote text-ink-2">{copyT.uses}</dt>
            <dd className="text-subhead tabular-nums">{uses}</dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Share2} onClick={share}>
          {copyT.share}
        </Button>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copy(link, copyT.copied, copyT.copyFailed)}>
          {copyT.copyLink}
        </Button>
        <Button size="sm" variant="secondary" icon={Copy} onClick={() => void copy(code, copyT.copied, copyT.copyFailed)}>
          {copyT.copyCode}
        </Button>
        <Button size="sm" variant="secondary" icon={Maximize2} onClick={() => setQrOpen(true)}>
          {copyT.showQr}
        </Button>
      </div>
      <Button variant="ghost" icon={RefreshCw} className="self-start" onClick={() => setReissueOpen(true)}>
        {copyT.reissue}
      </Button>

      <Sheet open={qrOpen} onOpenChange={setQrOpen} title={copyT.title} description={copyT.showQrText}>
        <div className="flex flex-col items-center gap-4 pb-2">
          <Qr svg={qrSvg} label={copyT.qr} className="aspect-square w-full max-w-80" />
          <p className="text-title-2 tracking-widest tabular-nums">{code}</p>
        </div>
      </Sheet>

      <Sheet
        open={reissueOpen}
        onOpenChange={setReissueOpen}
        title={copyT.reissue}
        description={copyT.reissueText}
        actions={
          <>
            <Button variant="destructive" size="lg" block loading={reissuing} onClick={reissue}>
              {copyT.reissueConfirm}
            </Button>
            <Button variant="ghost" size="lg" block onClick={() => setReissueOpen(false)}>
              {copyT.cancel}
            </Button>
          </>
        }
      />
    </div>
  );
}
