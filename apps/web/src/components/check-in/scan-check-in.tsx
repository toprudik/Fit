"use client";

import { qrScanner } from "@tma.js/sdk-react";
import { ScanLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { checkInPathFromScan } from "@/lib/check-in/link";
import { safely, safelyAsync, useInTelegram } from "@/lib/telegram/mini-app";

/**
 * "Отметиться по QR" on the client's booking around the session (PRD wave-3 §5 rule 4): Telegram's scanner reads
 * the trainer's QR and the app opens the check-in. Outside Telegram the phone camera does the same.
 */
export function ScanCheckIn() {
  const { t } = useI18n();
  const router = useRouter();
  const inTelegram = useInTelegram();
  if (!inTelegram || !safely(() => qrScanner.capture.isAvailable())) return null;

  async function scan() {
    const text = await safelyAsync(() => qrScanner.capture({ text: t.checkIn.scanText, capture: (qr) => checkInPathFromScan(qr) !== null }));
    if (text === undefined) return;
    const path = checkInPathFromScan(text);
    if (path) router.push(path);
    else toast.error(t.checkIn.scanFailed);
  }

  return (
    <Button type="button" size="lg" block icon={ScanLine} onClick={() => void scan()}>
      {t.checkIn.scan}
    </Button>
  );
}
