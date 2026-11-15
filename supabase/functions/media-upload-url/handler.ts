import { isUuid, json, readJson, type RpcError, rpcFailure } from "../_shared/http.ts";
import type { MediaStore } from "../_shared/media/types.ts";

export type UploadDeps = {
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: RpcError }>;
  };
  store: MediaStore;
};

type ReserveRow = { media_id: string; key: string; thumb_key: string };

export async function handleMediaUploadUrl(request: Request, deps: UploadDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ error: "Send a photo to upload." }, 400);
  const input = body as Record<string, unknown>;
  if (!isUuid(input.space_id)) return json({ error: "Choose a space." }, 400);
  if (!Number.isInteger(input.bytes) || !Number.isInteger(input.thumb_bytes)) {
    return json({ error: "each photo file must be between 1 byte and 5 MB" }, 400);
  }
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height)) {
    return json(
      { error: "photo dimensions must be between 1 and 2048 pixels on the long edge" },
      400,
    );
  }
  const caption = typeof input.caption === "string" ? input.caption : null;

  const reserved = await deps.supabase.rpc("reserve_photo_upload", {
    p_space_id: input.space_id,
    p_bytes: input.bytes,
    p_thumb_bytes: input.thumb_bytes,
    p_width: input.width,
    p_height: input.height,
    p_caption: caption,
  });
  if (reserved.error) return rpcFailure(reserved.error);

  const rows = Array.isArray(reserved.data) ? reserved.data : reserved.data ? [reserved.data] : [];
  const row = rows[0] as ReserveRow | undefined;
  if (!row?.media_id || !row.key || !row.thumb_key) {
    console.error("reserve_photo_upload returned no row");
    return json({ error: "Something went wrong." }, 500);
  }

  try {
    const upload = await deps.store.signUpload(row.key, "image/jpeg", Number(input.bytes));
    const thumb = await deps.store.signUpload(
      row.thumb_key,
      "image/jpeg",
      Number(input.thumb_bytes),
    );
    console.error("signed upload", row.media_id);
    return json({ media_id: row.media_id, upload, thumb });
  } catch (caught) {
    console.error(
      "sign upload failed",
      row.media_id,
      caught instanceof Error ? caught.name : "error",
    );
    return json({ error: "Something went wrong." }, 500);
  }
}
