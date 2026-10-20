import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL, WASM_BASE } from "./face-blur";

const APP = join(__dirname, "..", "..", "..");
const PUBLIC = join(APP, "public");

/*
 * The face detector loads from DaFit's own domain (legal/product-changes.md Б11): no CDN learns that someone opened
 * the photo editor. The model is in the repository; the WASM is copied from node_modules before dev and build.
 */
describe("the face detector's files", () => {
  it("come from the app's own origin", () => {
    for (const url of [WASM_BASE, MODEL]) expect(url).toMatch(/^\/mediapipe\//);
    const source = readFileSync(join(__dirname, "face-blur.ts"), "utf8");
    expect(source).not.toMatch(/https?:\/\//);
  });

  it("ship the model Google published, unchanged", () => {
    const model = readFileSync(join(PUBLIC, MODEL));
    expect(createHash("sha256").update(model).digest("hex")).toBe("b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f");
  });

  it("copy the WASM before both dev and build", () => {
    const scripts = JSON.parse(readFileSync(join(APP, "package.json"), "utf8")).scripts as Record<string, string>;
    expect(scripts.predev).toBe("node scripts/copy-mediapipe.mjs");
    expect(scripts.prebuild).toBe("node scripts/copy-mediapipe.mjs");
    const copy = readFileSync(join(APP, "scripts", "copy-mediapipe.mjs"), "utf8");
    // FilesetResolver.forVisionTasks loads vision_wasm[_nosimd]_internal.{js,wasm} from WASM_BASE.
    for (const file of ["vision_wasm_internal", "vision_wasm_nosimd_internal"]) {
      expect(copy).toContain(`"${file}.js"`);
      expect(copy).toContain(`"${file}.wasm"`);
    }
  });

  it("are the files @mediapipe/tasks-vision asks for", () => {
    const bundle = readFileSync(join(APP, "node_modules", "@mediapipe", "tasks-vision", "vision_bundle.mjs"), "utf8");
    expect(bundle).toMatch(/wasm\$\{.{0,40}"_module".{0,60}"_nosimd".{0,10}_internal/);
  });
});
