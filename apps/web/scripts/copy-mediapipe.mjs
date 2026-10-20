// Copies MediaPipe's WASM next to the app (public/mediapipe/wasm), so the face detector of the progress photo editor
// loads from DaFit's own domain instead of a CDN (lib/progress/face-blur.ts). Runs before `next dev` and
// `next build`; the files come from the installed @mediapipe/tasks-vision, so they always match its JS.
// Only the two variants FilesetResolver.forVisionTasks picks from (SIMD and no SIMD) are copied.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
];

const app = join(import.meta.dirname, "..");
const source = join(app, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const target = join(app, "public", "mediapipe", "wasm");

// Without the files the editor would quietly lose face detection; stop the build instead.
const missing = WASM_FILES.filter((file) => !existsSync(join(source, file)));
if (missing.length > 0) {
  console.error(`copy-mediapipe: ${missing.join(", ")} not found in ${source}. Run npm ci; the face detector needs them.`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });
for (const file of WASM_FILES) copyFileSync(join(source, file), join(target, file));
