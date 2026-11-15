import { describe, expect, it } from "vitest";
import { fitLongEdge, FULL_EDGE, isHeicBytes, jpegHasExif, THUMB_EDGE } from "./image.ts";
import { photoAlt, viewUrlNeedsRefresh } from "./altText.ts";
import { sendGate, tooManyPhotos, type PhotoDraft } from "./photoDraft.ts";

function draft(phase: PhotoDraft["phase"]): PhotoDraft {
  return { localId: phase, phase, progress: 0, previewUrl: "", caption: "" };
}

describe("photo bytes", () => {
  it("detects HEIC from the ftyp brand, not the file name", () => {
    const bytes = new Uint8Array(16);
    bytes.set([0, 0, 0, 24], 0);
    bytes.set(
      Array.from("ftypheic").map((char) => char.charCodeAt(0)),
      4,
    );
    expect(isHeicBytes(bytes)).toBe(true);
    expect(isHeicBytes(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });

  it("fits the long edge and does not upscale", () => {
    expect(fitLongEdge(4000, 2000, FULL_EDGE)).toEqual({ width: 2048, height: 1024 });
    expect(fitLongEdge(800, 600, FULL_EDGE)).toEqual({ width: 800, height: 600 });
    expect(fitLongEdge(2048, 1024, THUMB_EDGE)).toEqual({ width: 400, height: 200 });
  });

  it("sees an Exif segment and ignores a JPEG without one", () => {
    const clean = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const exif = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9,
    ]);
    expect(jpegHasExif(clean)).toBe(false);
    expect(jpegHasExif(exif)).toBe(true);
  });
});

describe("composer photo state", () => {
  it("enables send for text or a ready photo, and waits out an upload", () => {
    expect(sendGate("", []).enabled).toBe(false);
    expect(sendGate("Hi", []).enabled).toBe(true);
    expect(sendGate("", [draft("ready")]).enabled).toBe(true);
    expect(sendGate("Hi", [draft("uploading")]).enabled).toBe(false);
    expect(sendGate("", [draft("failed")]).enabled).toBe(false);
    expect(sendGate("Hi", [draft("failed")]).enabled).toBe(true);
  });

  it("stops an eleventh photo", () => {
    expect(tooManyPhotos(10, 1)).toMatch(/10 photos/);
    expect(tooManyPhotos(9, 1)).toBeNull();
  });
});

describe("photo presentation", () => {
  it("uses the caption, then a name and date", () => {
    expect(photoAlt("Picnic", "Grandma", "Nov 15")).toBe("Picnic");
    expect(photoAlt("  ", "Grandma", "Nov 15")).toBe("Photo from Grandma, Nov 15");
  });

  it("refreshes a view link in the last 10 minutes", () => {
    const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    expect(viewUrlNeedsRefresh(soon)).toBe(true);
    expect(viewUrlNeedsRefresh(later)).toBe(false);
  });
});
