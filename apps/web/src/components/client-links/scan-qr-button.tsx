"use client";

import { qrScanner } from "@tma.js/sdk-react";
import { ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { clientLinkPath, tokenFromScan } from "@/lib/client-links/link";
import { safely, safelyAsync, useInTelegram } from "@/lib/telegram/mini-app";

/**
 * "Сканировать QR" on /join (showScanQrPopup, screens.md §1.6): Telegram's scanner reads the
 * trainer's QR and the app opens its landing. Shown only inside Telegram clients that have it.
 */
export function ScanQrButton() {
  const { t } = useI18n();
  const router = useRouter();
  const inTelegram = useInTelegram();
  if (!inTelegram || !safely(() => qrScanner.capture.isAvailable())) return null;

  async function scan() {
    // The scanner stays open until it reads a trainer QR or the user closes it.
    const text = await safelyAsync(() => qrScanner.capture({ text: t.clientLinks.join.scanText, capture: (qr) => tokenFromScan(qr) !== null }));
    if (text === undefined) return;
    const token = tokenFromScan(text);
    if (token) router.push(clientLinkPath(token));
    else toast.error(t.clientLinks.join.scanFailed);
  }

  return (
    <Button type="button" variant="secondary" size="lg" block icon={ScanLine} onClick={() => void scan()}>
      {t.clientLinks.join.scan}
    </Button>
  );
}
