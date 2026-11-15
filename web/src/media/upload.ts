import { getSupabase } from "../lib/supabase.ts";

export type SignedTarget = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type ReservedUpload = {
  media_id: string;
  upload: SignedTarget;
  thumb: SignedTarget;
};

const SKIP_HEADERS = new Set(["content-length", "host"]);

function functionsUrl(name: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) throw new Error("VITE_SUPABASE_URL is not set");
  return `${base}/functions/v1/${name}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!token) throw new Error("Not signed in");
  if (!apikey) throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY is not set");
  return {
    authorization: `Bearer ${token}`,
    apikey,
    "content-type": "application/json",
  };
}

async function postFunction(name: string, body: unknown): Promise<Response> {
  return fetch(functionsUrl(name), {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
}

export async function reserveUpload(input: {
  spaceId: string;
  bytes: number;
  thumbBytes: number;
  width: number;
  height: number;
  caption?: string;
}): Promise<ReservedUpload> {
  const response = await postFunction("media-upload-url", {
    space_id: input.spaceId,
    bytes: input.bytes,
    thumb_bytes: input.thumbBytes,
    width: input.width,
    height: input.height,
    caption: input.caption ?? null,
  });
  const payload = (await response.json()) as { error?: string } & Partial<ReservedUpload>;
  if (!response.ok) throw new Error(payload.error || "Could not start the upload.");
  if (!payload.media_id || !payload.upload || !payload.thumb) {
    throw new Error("Could not start the upload.");
  }
  return payload as ReservedUpload;
}

export function putBlob(
  target: SignedTarget,
  body: Blob,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Upload cancelled"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => {
      xhr.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.open(target.method, target.url);
    for (const [key, value] of Object.entries(target.headers)) {
      if (SKIP_HEADERS.has(key.toLowerCase())) continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(body);
  });
}

export async function finishUpload(mediaId: string): Promise<"ready" | "failed"> {
  const response = await postFunction("media-finish", { media_id: mediaId });
  const payload = (await response.json()) as { status?: string; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not finish the upload.");
  return payload.status === "ready" ? "ready" : "failed";
}

export type ViewLink = { thumb: string; full: string; expiresAt: string };

export async function fetchViewUrls(mediaIds: string[]): Promise<Record<string, ViewLink>> {
  const unique = [...new Set(mediaIds)];
  const merged: Record<string, ViewLink> = {};
  for (let index = 0; index < unique.length; index += 60) {
    const batch = unique.slice(index, index + 60);
    const response = await postFunction("media-view-urls", { media_ids: batch });
    if (!response.ok) throw new Error("Could not load photos.");
    Object.assign(merged, (await response.json()) as Record<string, ViewLink>);
  }
  return merged;
}
