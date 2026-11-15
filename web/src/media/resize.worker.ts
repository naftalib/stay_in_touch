import { fitLongEdge, FULL_EDGE, outputTooBig, THUMB_EDGE } from "./image.ts";

type RequestMessage = {
  bitmap: ImageBitmap;
  quality: number;
  thumbQuality: number;
};

async function jpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  return await canvas.convertToBlob({ type: "image/jpeg", quality });
}

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  try {
    const { bitmap, quality, thumbQuality } = event.data;
    const fitted = fitLongEdge(bitmap.width, bitmap.height, FULL_EDGE);
    let full = await jpeg(bitmap, fitted.width, fitted.height, quality);
    const thumbSize = fitLongEdge(fitted.width, fitted.height, THUMB_EDGE);
    let thumb = await jpeg(bitmap, thumbSize.width, thumbSize.height, thumbQuality);
    if (outputTooBig(full.size) || outputTooBig(thumb.size)) {
      full = await jpeg(bitmap, fitted.width, fitted.height, 0.6);
      thumb = await jpeg(bitmap, thumbSize.width, thumbSize.height, 0.6);
    }
    bitmap.close();
    self.postMessage({ full, thumb, width: fitted.width, height: fitted.height });
  } catch (caught) {
    self.postMessage({ error: caught instanceof Error ? caught.message : "prepare failed" });
  }
};
