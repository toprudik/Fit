import { describe, expect, it } from "vitest";
import { blurMethod, photoPath } from "./photos";

describe("blurMethod", () => {
  it("names what hid the face", () => {
    expect(blurMethod({ autoFaces: 1, brushed: false, noFaceConfirmed: false })).toBe("auto");
    expect(blurMethod({ autoFaces: 2, brushed: true, noFaceConfirmed: false })).toBe("auto+brush");
    expect(blurMethod({ autoFaces: 0, brushed: true, noFaceConfirmed: false })).toBe("brush");
    expect(blurMethod({ autoFaces: 0, brushed: false, noFaceConfirmed: true })).toBe("none_no_face");
  });

  it("refuses a photo with no face found, no brush and no confirmation (PROG-4)", () => {
    expect(blurMethod({ autoFaces: 0, brushed: false, noFaceConfirmed: false })).toBeNull();
  });
});

describe("photoPath", () => {
  it("matches the storage_path check of progress_photos", () => {
    expect(photoPath("c", "p", "image/webp")).toBe("c/p.webp");
    expect(photoPath("c", "p", "image/jpeg")).toBe("c/p.jpg");
  });
});
