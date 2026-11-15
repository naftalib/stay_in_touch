import {
  assertInputSize,
  fitLongEdge,
  FULL_EDGE,
  isHeicBytes,
  outputTooBig,
  THUMB_EDGE,
} from "./image.ts";

export type PreparedPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  previewUrl: string;
};

type ResizeRequest = {
  bitmap: ImageBitmap;
  quality: number;
  thumbQuality: number;
};

type ResizeResult = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
};

const CANNOT_OPEN = "This photo can't be opened here. Try another photo.";
const STILL_TOO_BIG = "This photo is still too large after resizing. Try another photo.";

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  assertInputSize(file.size);
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const heic = isHeicBytes(head);
  let source: Blob = file;
  try {
    return await resizeBlob(source, 0.85, 0.8);
  } catch (first) {
    if (!heic) {
      if (first instanceof Error && first.message === STILL_TOO_BIG) throw first;
      throw new Error(CANNOT_OPEN);
    }
  }
  const converted = await convertHeic(file);
  try {
    return await resizeBlob(converted, 0.85, 0.8);
  } catch (second) {
    if (second instanceof Error && second.message === STILL_TOO_BIG) throw second;
    throw new Error(CANNOT_OPEN);
  }
}

async function convertHeic(file: Blob): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  const result = await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
  return result;
}

async function resizeBlob(
  source: Blob,
  quality: number,
  thumbQuality: number,
): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const rendered = await render(bitmap, quality, thumbQuality);
    if (rendered.full.type !== "image/jpeg" || rendered.thumb.type !== "image/jpeg") {
      throw new Error(CANNOT_OPEN);
    }
    if (outputTooBig(rendered.full.size) || outputTooBig(rendered.thumb.size)) {
      throw new Error(STILL_TOO_BIG);
    }
    return {
      ...rendered,
      previewUrl: URL.createObjectURL(rendered.thumb),
    };
  } finally {
    bitmap.close();
  }
}

async function render(
  bitmap: ImageBitmap,
  quality: number,
  thumbQuality: number,
): Promise<ResizeResult> {
  if (typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    try {
      const copy = await createImageBitmap(bitmap);
      return await renderInWorker({ bitmap: copy, quality, thumbQuality });
    } catch {
      // Safari without a working OffscreenCanvas worker falls through.
    }
  }
  return renderOnMain(bitmap, quality, thumbQuality);
}

function renderInWorker(request: ResizeRequest): Promise<ResizeResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./resize.worker.ts", import.meta.url), { type: "module" });
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("prepare timeout"));
    }, 30_000);
    worker.onmessage = (event: MessageEvent<ResizeResult | { error: string }>) => {
      window.clearTimeout(timer);
      worker.terminate();
      if ("error" in event.data) {
        reject(new Error(event.data.error));
        return;
      }
      resolve(event.data);
    };
    worker.onerror = () => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error("worker failed"));
    };
    worker.postMessage(request, [request.bitmap]);
  });
}

export async function renderOnMain(
  bitmap: ImageBitmap,
  quality: number,
  thumbQuality: number,
): Promise<ResizeResult> {
  const fitted = fitLongEdge(bitmap.width, bitmap.height, FULL_EDGE);
  let full = await canvasJpeg(bitmap, fitted.width, fitted.height, quality);
  const thumbSize = fitLongEdge(fitted.width, fitted.height, THUMB_EDGE);
  let thumb = await canvasJpeg(bitmap, thumbSize.width, thumbSize.height, thumbQuality);
  if (outputTooBig(full.size) || outputTooBig(thumb.size)) {
    full = await canvasJpeg(bitmap, fitted.width, fitted.height, 0.6);
    thumb = await canvasJpeg(bitmap, thumbSize.width, thumbSize.height, 0.6);
  }
  return { full, thumb, width: fitted.width, height: fitted.height };
}

function canvasJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("no canvas"));
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality,
    );
  });
}
