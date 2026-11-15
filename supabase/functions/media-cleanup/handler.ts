import { json } from "../_shared/http.ts";
import type { MediaStore } from "../_shared/media/types.ts";
import type { RpcError } from "../_shared/http.ts";

export type OrphanRow = { media_id: string; object_key: string; thumb_key: string | null };

export type CleanupDeps = {
  secret: string | undefined;
  supabaseAdmin: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: RpcError }>;
  };
  store: MediaStore;
};

function secretsMatch(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function handleMediaCleanup(request: Request, deps: CleanupDeps): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!deps.secret) {
    console.error("MEDIA_CLEANUP_SECRET is missing");
    return json({ error: "Server misconfigured." }, 500);
  }
  const provided = request.headers.get("x-media-cleanup-secret") ?? "";
  if (!provided || !secretsMatch(provided, deps.secret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const listed = await deps.supabaseAdmin.rpc("list_photo_orphans");
  if (listed.error) {
    console.error("list_photo_orphans failed", listed.error.code ?? "unknown");
    return json({ error: "Something went wrong." }, 500);
  }
  const rows = (Array.isArray(listed.data) ? listed.data : []) as OrphanRow[];
  const keys = rows.flatMap((row) =>
    row.thumb_key ? [row.object_key, row.thumb_key] : [row.object_key]
  );
  if (keys.length > 0) {
    try {
      await deps.store.remove(keys);
    } catch (caught) {
      console.error("orphan remove failed", caught instanceof Error ? caught.name : "error");
      return json({ error: "Something went wrong." }, 500);
    }
  }
  const ids = rows.map((row) => row.media_id);
  const deleted = await deps.supabaseAdmin.rpc("delete_photo_orphan_rows", { p_ids: ids });
  if (deleted.error) {
    console.error("delete_photo_orphan_rows failed", deleted.error.code ?? "unknown");
    return json({ error: "Something went wrong." }, 500);
  }
  const removed = typeof deleted.data === "number" ? deleted.data : ids.length;
  console.error("orphan cleanup", removed);
  return json({ removed });
}
