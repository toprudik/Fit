# MediaPipe files for the progress photo editor

The face detector in `src/lib/progress/face-blur.ts` loads these from DaFit's own domain, so opening the editor
sends nothing to a third party.

- `blaze_face_short_range.tflite`: BlazeFace short range, float16, version 1, from
  `storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/`. Apache License 2.0
  (Google). SHA-256 `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`, checked by
  `src/lib/progress/face-blur-assets.test.ts`.
- `wasm/`: not in the repository. `scripts/copy-mediapipe.mjs` copies it from the installed
  `@mediapipe/tasks-vision` (Apache License 2.0) before `npm run dev` and `npm run build`.
