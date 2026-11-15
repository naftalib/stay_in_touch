const MAX_INPUT_BYTES = 50 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
export const FULL_EDGE = 2048;
export const THUMB_EDGE = 400;

export function fitLongEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** HEIC/HEIF brands in the ISO BMFF `ftyp` box, not the file name. */
export function isHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const box = ascii(bytes, 4, 8);
  if (box !== "ftyp") return false;
  const brand = ascii(bytes, 8, 12);
  return (
    brand === "heic" || brand === "heix" || brand === "mif1" || brand === "hevc" || brand === "hevx"
  );
}

export function jpegHasExif(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return false;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return false;
    if (marker === 0xe1 && ascii(bytes, offset + 4, offset + 8) === "Exif") return true;
    offset += 2 + length;
  }
  return false;
}

export function assertInputSize(bytes: number): void {
  if (bytes > MAX_INPUT_BYTES) {
    throw new Error("This photo is larger than 50 MB. Try a smaller one.");
  }
}

export function outputTooBig(bytes: number): boolean {
  return bytes > MAX_OUTPUT_BYTES;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let i = start; i < end && i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}
