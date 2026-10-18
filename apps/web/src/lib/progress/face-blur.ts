import { MAX_PHOTO_SIDE, type PhotoType } from "./photos";

/**
 * On-device face hiding for progress photos (PRD wave-1 §2.11-4, PROG-3). Everything here runs in the browser:
 * the original is decoded into a canvas, faces are found by MediaPipe's face detector, and the faces and any
 * brushed areas are pixelated beyond recovery. Only the pixelated canvas is ever encoded for upload, and
 * re-encoding drops the camera's EXIF (location included). The detector's WASM and model are served from
 * DaFit's own domain (public/mediapipe), so opening the editor sends nothing to a third party; the photo itself
 * never leaves the device. When the detector cannot load, the editor falls back to the brush
 * and the "no face" confirmation.
 */

/** Copied from the installed @mediapipe/tasks-vision before dev and build (scripts/copy-mediapipe.mjs), so it matches its JS. */
export const WASM_BASE = "/mediapipe/wasm";
/** BlazeFace short range, float16 (Apache 2.0), from MediaPipe's model storage; see public/mediapipe/README.md. */
export const MODEL = "/mediapipe/blaze_face_short_range.tflite";

export type Box = { x: number; y: number; width: number; height: number };

type Detector = { detect: (image: HTMLCanvasElement) => { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[] } };

let detector: Promise<Detector | null> | null = null;

function loadDetector(): Promise<Detector | null> {
  detector ??= (async () => {
    try {
      const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
      return await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.35,
      });
    } catch (error) {
      console.error("the face detector did not load", error);
      detector = null;
      return null;
    }
  })();
  return detector;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d canvas");
  return ctx;
}

/** The picked file as a canvas, upright by its EXIF orientation and scaled down to MAX_PHOTO_SIDE. */
export async function decodePhoto(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = canvasOf(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = context(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Faces found in one square window of the photo, in photo coordinates. */
function boxesInWindow(found: Detector, photo: HTMLCanvasElement, left: number, top: number, side: number): Box[] {
  const window = canvasOf(256, 256);
  context(window).drawImage(photo, left, top, side, side, 0, 0, 256, 256);
  const scale = side / 256;
  return found.detect(window).detections.flatMap(({ boundingBox: box }) =>
    box ? [{ x: left + box.originX * scale, y: top + box.originY * scale, width: box.width * scale, height: box.height * scale }] : [],
  );
}

function overlaps(a: Box, b: Box): boolean {
  return Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) < Math.max(a.width, b.width) / 2 &&
    Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) < Math.max(a.height, b.height) / 2;
}

/**
 * Faces in the photo, or null when the detector is unavailable. The short-range model expects a face that
 * fills a good part of its input, while a full-height progress photo has a small face, so the photo is also
 * searched in overlapping windows of a half and a third of its width, upper part first.
 */
export async function detectFaces(photo: HTMLCanvasElement): Promise<Box[] | null> {
  const found = await loadDetector();
  if (!found) return null;
  try {
    const boxes: Box[] = [];
    const add = (more: Box[]) => {
      for (const box of more) if (!boxes.some((seen) => overlaps(seen, box))) boxes.push(box);
    };
    add(found.detect(photo).detections.flatMap(({ boundingBox: box }) => (box ? [{ x: box.originX, y: box.originY, width: box.width, height: box.height }] : [])));
    const short = Math.min(photo.width, photo.height);
    for (const fraction of [1, 1 / 2, 1 / 3]) {
      const side = Math.round(short * fraction);
      const step = Math.max(1, Math.round(side / 2));
      for (let top = 0; top + side <= Math.max(side, photo.height * 0.8); top += step) {
        for (let left = 0; left + side <= photo.width; left += step) add(boxesInWindow(found, photo, left, top, side));
        if (photo.width % step) add(boxesInWindow(found, photo, photo.width - side, top, side));
      }
    }
    return boxes;
  } catch (error) {
    console.error("face detection failed", error);
    return null;
  }
}

/** A copy pixelated in blocks of about a fiftieth of the photo: nothing of a face survives it. */
export function pixelate(photo: HTMLCanvasElement): HTMLCanvasElement {
  const block = Math.max(10, Math.round(Math.max(photo.width, photo.height) / 48));
  const small = canvasOf(Math.ceil(photo.width / block), Math.ceil(photo.height / block));
  context(small).drawImage(photo, 0, 0, small.width, small.height);
  const out = canvasOf(photo.width, photo.height);
  const ctx = context(out);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, out.width, out.height);
  return out;
}

export function emptyMask(photo: HTMLCanvasElement): HTMLCanvasElement {
  return canvasOf(photo.width, photo.height);
}

/** Marks each face, with a margin for hair and ears, as an area to pixelate. */
export function maskFaces(mask: HTMLCanvasElement, boxes: Box[]) {
  const ctx = context(mask);
  ctx.fillStyle = "#000";
  for (const box of boxes) {
    ctx.beginPath();
    ctx.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width * 0.8, box.height * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** One brush dab: adds to the pixelated area, or erases from it. */
export function brush(mask: HTMLCanvasElement, x: number, y: number, radius: number, mode: "blur" | "erase") {
  const ctx = context(mask);
  ctx.globalCompositeOperation = mode === "blur" ? "source-over" : "destination-out";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

export function maskIsEmpty(mask: HTMLCanvasElement): boolean {
  const { data } = context(mask).getImageData(0, 0, mask.width, mask.height);
  for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) return false;
  return true;
}

/** Draws the photo with the masked areas pixelated into `target`, which is what is shown and uploaded. */
export function compose(target: HTMLCanvasElement, photo: HTMLCanvasElement, pixels: HTMLCanvasElement, mask: HTMLCanvasElement) {
  target.width = photo.width;
  target.height = photo.height;
  const ctx = context(target);
  ctx.drawImage(photo, 0, 0);
  const layer = canvasOf(photo.width, photo.height);
  const layerCtx = context(layer);
  layerCtx.drawImage(mask, 0, 0);
  layerCtx.globalCompositeOperation = "source-in";
  layerCtx.drawImage(pixels, 0, 0);
  ctx.drawImage(layer, 0, 0);
}

/** WebP where the browser encodes it, JPEG otherwise (Safari); both are accepted by the bucket. */
export async function encode(canvas: HTMLCanvasElement): Promise<{ blob: Blob; type: PhotoType }> {
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await toBlob("image/webp");
  if (webp?.type === "image/webp") return { blob: webp, type: "image/webp" };
  const jpeg = await toBlob("image/jpeg");
  if (!jpeg) throw new Error("encoding the photo failed");
  return { blob: jpeg, type: "image/jpeg" };
}
