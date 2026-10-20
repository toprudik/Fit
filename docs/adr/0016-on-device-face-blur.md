# 16. Face blur for progress photos happens on the device

- Status: accepted
- Date: 2026-10-16

## Context

PRD wave 1 §2.11-4 says the original progress photo never leaves the phone: the face is found automatically and blurred before upload, the client can touch it up with a brush, and a photo with no face found needs the client to confirm "there is no face" (PROG-3, PROG-4). The Mini App runs in Telegram's web view on iOS and Android, where the browser's own `FaceDetector` is missing.

## Decision

- The editor (`components/progress/photo-editor.tsx`, `lib/progress/face-blur.ts`) decodes the picked file into a canvas, upright by its EXIF orientation and at most 1600 px on the long side.
- Faces are found by MediaPipe's face detector (`@mediapipe/tasks-vision`, the BlazeFace short-range model). It runs on the canvas in the browser. Its WASM and the model are served from DaFit's own domain (`apps/web/public/mediapipe`): the model is in the repository, and `scripts/copy-mediapipe.mjs` copies the WASM from the installed package before dev and build, so it always matches the package's JS. No third party learns that the editor was opened, and no photo data is sent anywhere (legal/product-changes.md Б11; until 18.10.2026 they came from jsDelivr and Google's model bucket). A full-height photo has a small face near the top, so the top half is searched again at twice the size.
- Faces and brushed areas are pixelated in blocks of about a fiftieth of the photo. Pixelation is used instead of a canvas blur filter because Safari's support for canvas filters is patchy, and coarse blocks leave nothing to recover.
- Only the composed canvas is encoded (WebP, or JPEG where the browser can't encode WebP) and uploaded to a one-time signed Storage URL. Re-encoding drops the camera's EXIF, location included.
- If the detector can't load (offline, a blocked CDN), the editor says so and falls back to the brush and the "no face" confirmation. Saving stays blocked until something is blurred or the client confirms.

## Consequences

- The detector adds about 12 MB of WASM, fetched only on the "Новое фото" screen and cached by the browser.
- The photo screen depends on two third-party hosts for automatic detection. Moving them into our own static hosting is a later option if either becomes a problem; the brush keeps the flow working meanwhile.
- `progress_photos.blur_method` records what hid the face: `auto`, `auto+brush`, `brush` or `none_no_face`.
