"use client";

import { ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorClass = new (options: { formats: string[] }) => Detector;

const FORMATS = ["ean_13", "ean_8", "upc_a"];

function detectorClass(): DetectorClass | null {
  if (typeof window === "undefined") return null;
  const found = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  return found && typeof navigator.mediaDevices?.getUserMedia === "function" ? found : null;
}

/**
 * Camera scan of a product barcode with the browser's BarcodeDetector. Where the browser has no
 * detector or no camera (desktop Firefox, some Telegram clients), it says so and the manual field
 * next to it does the job. The camera runs only while the person scans.
 */
export function BarcodeScanner({ onDetected }: { onDetected: (code: string) => void }) {
  const copy = useI18n().t.foodDiary.barcode;
  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const detected = useRef(onDetected);

  useEffect(() => {
    detected.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    // Feature detection needs window, so it runs after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(detectorClass() !== null);
  }, []);

  useEffect(() => {
    if (!scanning) return;
    const Found = detectorClass();
    if (!Found) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const detector = new Found({ formats: FORMATS });

    const tick = async () => {
      if (stopped || !video.current) return;
      try {
        const codes = await detector.detect(video.current);
        const code = codes[0]?.rawValue;
        if (code && !stopped) {
          setScanning(false);
          detected.current(code);
          return;
        }
      } catch {
        // A frame that is not ready yet; try the next one.
      }
      frame = window.setTimeout(tick, 250);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (video.current) {
          video.current.srcObject = media;
          void video.current.play().then(tick, tick);
        }
      })
      .catch(() => {
        setFailed(true);
        setScanning(false);
      });

    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning]);

  if (supported === null) return null;
  if (!supported || failed) {
    return <p className="text-sm text-muted-foreground">{copy.cameraUnavailable}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {scanning ? (
        <>
          <video
            ref={video}
            muted
            playsInline
            aria-label={copy.scanning}
            className="aspect-[4/3] w-full rounded-xl bg-black object-cover"
          />
          <p className="text-sm text-muted-foreground" role="status">
            {copy.scanning}
          </p>
          <Button type="button" variant="secondary" onClick={() => setScanning(false)}>
            {copy.stop}
          </Button>
        </>
      ) : (
        <Button type="button" variant="secondary" icon={ScanLine} onClick={() => setScanning(true)}>
          {copy.scan}
        </Button>
      )}
    </div>
  );
}
