"use client";

import { Camera, ImageUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { DateField } from "@/components/ui/date-field";
import { useI18n } from "@/i18n/client";
import { brush, compose, decodePhoto, detectFaces, emptyMask, encode, maskFaces, maskIsEmpty, pixelate } from "@/lib/progress/face-blur";
import { prepareProgressPhoto, saveProgressPhoto } from "@/lib/progress/photo-actions";
import { blurMethod, PHOTO_ANGLES, type PhotoAngle } from "@/lib/progress/photos";
import { uploadToSignedUrl } from "@/lib/supabase/upload";

type Layers = { photo: HTMLCanvasElement; pixels: HTMLCanvasElement; mask: HTMLCanvasElement; faces: number | null };

/**
 * "Новое фото" (screens.md, PRD wave-1 §2.11-4): angle and date, then the camera or the gallery, then the face
 * is found and pixelated on the device, the brush adds or erases pixelation, and only the composed canvas is
 * uploaded (PROG-3). Without a found face and without brushing, saving waits for "Лица нет" (PROG-4).
 */
export function PhotoEditor({ today, angle: initialAngle, date: initialDate, taken }: { today: string; angle: PhotoAngle; date: string; taken: string[] }) {
  const { t } = useI18n();
  const copy = t.progress.photos;
  const router = useRouter();
  const [angle, setAngle] = useState<PhotoAngle>(initialAngle);
  const [date, setDate] = useState(initialDate);
  const [layers, setLayers] = useState<Layers | null>(null);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<"blur" | "erase">("blur");
  const [brushed, setBrushed] = useState(false);
  const [maskEmpty, setMaskEmpty] = useState(true);
  const [noFace, setNoFace] = useState(false);
  const [limited, setLimited] = useState(false);
  const [saving, startSaving] = useTransition();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (layers && canvas.current) compose(canvas.current, layers.photo, layers.pixels, layers.mask);
  }, [layers]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setLimited(false);
    try {
      const photo = await decodePhoto(file);
      const faces = await detectFaces(photo);
      const mask = emptyMask(photo);
      if (faces?.length) maskFaces(mask, faces);
      setBrushed(false);
      setNoFace(false);
      setMaskEmpty(!faces?.length);
      setLayers({ photo, pixels: pixelate(photo), mask, faces: faces ? faces.length : null });
    } catch (error) {
      console.error("opening the photo failed", error);
      toast.error(copy.badFile);
    } finally {
      setBusy(false);
    }
  }

  function paint(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!layers || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    const scale = layers.photo.width / rect.width;
    brush(layers.mask, (event.clientX - rect.left) * scale, (event.clientY - rect.top) * scale, layers.photo.width * 0.045, tool);
    compose(canvas.current, layers.photo, layers.pixels, layers.mask);
    setBrushed(true);
  }

  const method = layers
    ? blurMethod({ autoFaces: maskEmpty ? 0 : (layers.faces ?? 0), brushed: brushed && !maskEmpty, noFaceConfirmed: maskEmpty && noFace })
    : null;

  function save() {
    if (!layers || !canvas.current || !method) return;
    const target = canvas.current;
    startSaving(async () => {
      try {
        const { blob, type } = await encode(target);
        const prepared = await prepareProgressPhoto({ angle, date, type });
        if (prepared.status !== "ready") throw new Error(prepared.status);
        const uploaded = await uploadToSignedUrl("progress-photos", prepared.path, prepared.token, new File([blob], prepared.path.split("/")[1], { type }));
        if (!uploaded) throw new Error("upload");
        const saved = await saveProgressPhoto({
          id: prepared.id,
          path: prepared.path,
          angle,
          date,
          blurMethod: method,
          width: target.width,
          height: target.height,
          replaceId: prepared.replaceId,
        });
        if (saved.status === "limit") {
          setLimited(true);
          return;
        }
        if (saved.status !== "saved") throw new Error(saved.status);
        toast.success(copy.saved);
        router.push("/client/progress/photos");
      } catch (error) {
        console.error("saving the photo failed", error);
        toast.error(copy.failed);
      }
    });
  }

  const status = !layers ? null : layers.faces === null ? copy.detectorOff : layers.faces > 0 ? copy.found : copy.notFound;

  return (
    <div className="flex flex-col gap-4">
      <ChipRow label={copy.angleLabel}>
        {PHOTO_ANGLES.map((option) => (
          <Chip key={option} selected={option === angle} onClick={() => setAngle(option)}>
            {copy.angles[option]}
          </Chip>
        ))}
      </ChipRow>
      <DateField
        label={copy.date}
        value={date}
        max={today}
        required
        onChange={(next) => next && next <= today && setDate(next)}
        hint={taken.includes(`${date}:${angle}`) ? copy.replaces : undefined}
      />

      {busy ? (
        <p role="status" className="flex items-center gap-2 px-1 text-subhead text-ink-2">
          <Spinner />
          {copy.searching}
        </p>
      ) : null}

      {layers ? (
        <>
          <p className="px-1 text-subhead text-ink-2" aria-live="polite">
            {status}
          </p>
          <canvas
            ref={canvas}
            role="img"
            aria-label={copy.canvasLabel}
            className="max-h-[65vh] w-full touch-none rounded-md bg-surface-2 object-contain"
            onPointerDown={(event) => {
              drawing.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              paint(event);
            }}
            onPointerMove={(event) => drawing.current && paint(event)}
            onPointerUp={() => {
              drawing.current = false;
              if (layers) setMaskEmpty(maskIsEmpty(layers.mask));
            }}
            onPointerCancel={() => {
              drawing.current = false;
            }}
          />
          <SegmentedControl
            label={copy.toolLabel}
            value={tool}
            onValueChange={setTool}
            options={(["blur", "erase"] as const).map((value) => ({ value, label: copy.tools[value] }))}
          />
          {maskEmpty ? (
            <div className="rounded-lg bg-surface-1 px-4 py-3">
              <Switch checked={noFace} onCheckedChange={setNoFace} label={copy.noFace} showLabel />
            </div>
          ) : null}
          {limited ? (
            <div role="alert" className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4 text-subhead">
              <p>{copy.limit}</p>
              <Link href="/settings/plan" className="font-semibold text-accent-ink">
                {copy.limitAction}
              </Link>
            </div>
          ) : null}
          <Button size="lg" block disabled={!method || saving} loading={saving} onClick={save}>
            {copy.save}
          </Button>
          <label className={buttonVariants({ variant: "ghost", size: "lg", block: true })}>
            {copy.another}
            <input type="file" accept="image/*" className="sr-only" disabled={busy || saving} onChange={(event) => pick(event.target.files?.[0])} />
          </label>
        </>
      ) : busy ? null : (
        <div className="flex flex-col gap-3">
          <p className="px-1 text-subhead text-ink-2">{copy.pickHint}</p>
          <label className={buttonVariants({ size: "lg", block: true })}>
            <Camera aria-hidden size={20} strokeWidth={1.75} />
            {copy.camera}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => pick(event.target.files?.[0])} />
          </label>
          <label className={buttonVariants({ variant: "secondary", size: "lg", block: true })}>
            <ImageUp aria-hidden size={20} strokeWidth={1.75} />
            {copy.gallery}
            <input type="file" accept="image/*" className="sr-only" onChange={(event) => pick(event.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}
