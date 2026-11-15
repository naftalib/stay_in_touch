import { isUuid, json, readJson, type RpcError } from "../_shared/http.ts";
import type { MediaStore } from "../_shared/media/types.ts";

const MAX_BYTES = 5_242_880;

export type MediaRow = {
  id: string;
  status: string;
  r2_key: string;
  thumb_key: string | null;
  expected_bytes: number | null;
  expected_thumb_bytes: number | null;
};

export type FinishDeps = {
  loadMedia: (id: string) => Promise<{ data: MediaRow | null; error: RpcError }>;
  markReady: (args: Record<string, unknown>) => Promise<{ error: RpcError }>;
  markFailed: (args: Record<string, unknown>) => Promise<{ error: RpcError }>;
  store: MediaStore;
  provider: string;
};

function isJpeg(contentType: string): boolean {
  return contentType.toLowerCase().startsWith("image/jpeg");
}

export async function handleMediaFinish(request: Request, deps: FinishDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await readJson(request);
  const mediaId = body && typeof body === "object"
    ? (body as { media_id?: unknown }).media_id
    : null;
  if (!isUuid(mediaId)) return json({ error: "Choose a photo." }, 400);

  const loaded = await deps.loadMedia(mediaId);
  if (loaded.error) {
    console.error("finish read failed", mediaId, loaded.error.code ?? "unknown");
    return json({ error: "Something went wrong." }, 500);
  }
  const row = loaded.data;
  if (!row) return json({ error: "That photo is not available." }, 404);
  if (row.status === "ready") return json({ media_id: mediaId, status: "ready" });
  if (row.status === "failed") return json({ media_id: mediaId, status: "failed" });
  if (row.status !== "pending" || !row.thumb_key) {
    return json({ error: "That photo is not available." }, 404);
  }

  const original = await deps.store.head(row.r2_key);
  const thumb = await deps.store.head(row.thumb_key);
  const matches = original !== null &&
    thumb !== null &&
    isJpeg(original.contentType) &&
    isJpeg(thumb.contentType) &&
    original.bytes === row.expected_bytes &&
    thumb.bytes === row.expected_thumb_bytes &&
    original.bytes >= 1 &&
    original.bytes <= MAX_BYTES &&
    thumb.bytes >= 1 &&
    thumb.bytes <= MAX_BYTES;

  if (!matches) {
    try {
      await deps.store.remove([row.r2_key, row.thumb_key]);
    } catch (caught) {
      console.error(
        "finish cleanup failed",
        mediaId,
        caught instanceof Error ? caught.name : "error",
      );
    }
    const failed = await deps.markFailed({ p_media_id: mediaId });
    if (failed.error) {
      console.error("mark_media_failed failed", mediaId, failed.error.code ?? "unknown");
      return json({ error: "Something went wrong." }, 500);
    }
    console.error("upload rejected", mediaId);
    return json({ media_id: mediaId, status: "failed" });
  }

  const ready = await deps.markReady({
    p_media_id: mediaId,
    p_bytes: original.bytes,
    p_thumb_bytes: thumb.bytes,
    p_provider: deps.provider,
  });
  if (ready.error) {
    console.error("mark_media_ready failed", mediaId, ready.error.code ?? "unknown");
    return json({ error: "Something went wrong." }, 500);
  }
  console.error("upload ready", mediaId);
  return json({ media_id: mediaId, status: "ready" });
}
