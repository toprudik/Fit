"use client";

import { Download, MapPin, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { useI18n } from "@/i18n/client";
import { loadPlaceQr, placeQrDownload } from "@/lib/check-in/actions";
import { canDownloadInTelegram, downloadInTelegram } from "@/lib/telegram/mini-app";

type Place = { id: string; name: string; address: string | null };

/**
 * The trainer's locations on /trainer/checkin-qr, each with its printed check-in QR (PRD wave-3 §5 rule 2b): show it,
 * save it as an image for printing, or issue a new one when an old print should stop working. On the website the
 * SVG is a plain download link; the Mini App's WebView ignores `download` (QA 23.10), so there the server stores a
 * PNG and Telegram's own dialog saves it.
 */
export function PlaceQrList({ places }: { places: Place[] }) {
  const { t } = useI18n();
  const copy = t.checkIn;
  const [open, setOpen] = useState<Place | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [pending, startTransition] = useTransition();
  const [saving, startSaving] = useTransition();

  const load = (place: Place, renew: boolean) =>
    startTransition(async () => {
      const result = await loadPlaceQr(place.id, renew);
      if (result.status === "done") {
        setQrSvg(result.qrSvg);
        setFailed(false);
        if (renew) toast.success(copy.placeRenewed);
      } else {
        setFailed(true);
      }
    });

  const show = (place: Place) => {
    setOpen(place);
    setQrSvg(null);
    setFailed(false);
    setConfirmRenew(false);
    load(place, false);
  };

  const download = qrSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}` : null;

  const saveInTelegram = (place: Place) =>
    startSaving(async () => {
      const result = await placeQrDownload(place.id, `${copy.placeFile} ${place.name}.png`);
      if (result.status !== "done" || !downloadInTelegram(result.url, `${copy.placeFile} ${place.name}.png`)) toast.error(copy.placeSaveFailed);
    });

  return (
    <>
      <ListGroup footer={copy.placesHint}>
        {places.map((place) => (
          <ListRow key={place.id} icon={MapPin} title={place.name} subtitle={place.address ?? undefined} onClick={() => show(place)} />
        ))}
      </ListGroup>
      <Sheet
        open={open !== null}
        onOpenChange={(next) => (next ? null : setOpen(null))}
        title={open?.name ?? copy.placesTitle}
        description={confirmRenew ? copy.placeRenewText : copy.placeText}
        actions={
          confirmRenew ? (
            <>
              <Button type="button" variant="destructive" block loading={pending} onClick={() => open && (setConfirmRenew(false), load(open, true))}>
                {copy.placeRenewConfirm}
              </Button>
              <Button type="button" variant="secondary" block onClick={() => setConfirmRenew(false)}>
                {copy.keepPlaceQr}
              </Button>
            </>
          ) : (
            <>
              {download && open ? (
                <Button asChild block aria-busy={saving || undefined}>
                  <a
                    href={download}
                    download={`${copy.placeFile} ${open.name}.svg`}
                    onClick={(event) => {
                      if (!canDownloadInTelegram()) return;
                      event.preventDefault();
                      if (!saving) saveInTelegram(open);
                    }}
                  >
                    <Download aria-hidden size={18} />
                    {copy.placeDownload}
                  </a>
                </Button>
              ) : null}
              <Button type="button" variant="secondary" block icon={RefreshCw} disabled={!qrSvg} onClick={() => setConfirmRenew(true)}>
                {copy.placeRenew}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col items-center">
          {failed ? (
            <p role="alert" className="text-body text-ink-2">
              {copy.failed}
            </p>
          ) : qrSvg ? (
            <div
              role="img"
              aria-label={copy.qrLabel}
              className="aspect-square w-full max-w-64 overflow-hidden rounded-lg bg-white [&>svg]:size-full"
              // Built on the server by the qrcode package from our own link, not from user input.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <Skeleton className="aspect-square h-auto w-full max-w-64 rounded-lg" />
          )}
        </div>
      </Sheet>
    </>
  );
}
