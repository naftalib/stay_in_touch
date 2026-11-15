import { isUuid, json, readJson, type RpcError } from "../_shared/http.ts";
import type { MediaStore } from "../_shared/media/types.ts";

const MAX_IDS = 60;
const TTL_SECONDS = 3600;

export type ViewRow = {
  id: string;
  status: string;
  r2_key: string;
  thumb_key: string | null;
};

export type ViewDeps = {
  loadMedia: (ids: string[]) => Promise<{ data: ViewRow[] | null; error: RpcError }>;
  store: MediaStore;
};

export async function handleMediaViewUrls(request: Request, deps: ViewDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await readJson(request);
  const ids = body && typeof body === "object" ? (body as { media_ids?: unknown }).media_ids : null;
  if (
    !Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || ids.some((id) => !isUuid(id))
  ) {
    return json({ error: "Choose up to 60 photos." }, 400);
  }

  const loaded = await deps.loadMedia(ids);
  if (loaded.error) {
    console.error("view read failed", loaded.error.code ?? "unknown");
    return json({ error: "Something went wrong." }, 500);
  }

  const ready = (loaded.data ?? []).filter((row) =>
    row.status === "ready" && row.thumb_key && row.r2_key
  );
  const keys = ready.flatMap((row) => [row.thumb_key as string, row.r2_key]);
  let signed: Record<string, { url: string; expiresAt: string }> = {};
  if (keys.length > 0) {
    try {
      signed = await deps.store.signViews(keys, TTL_SECONDS);
    } catch (caught) {
      console.error("sign views failed", caught instanceof Error ? caught.name : "error");
      return json({ error: "Something went wrong." }, 500);
    }
  }

  const out: Record<string, { thumb: string; full: string; expiresAt: string }> = {};
  for (const row of ready) {
    const thumb = signed[row.thumb_key as string];
    const full = signed[row.r2_key];
    if (!thumb || !full) continue;
    out[row.id] = { thumb: thumb.url, full: full.url, expiresAt: thumb.expiresAt };
  }
  return json(out);
}
