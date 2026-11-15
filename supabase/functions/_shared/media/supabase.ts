import { createClient } from "@supabase/supabase-js";
import type { MediaStore, SignedUpload, SignedView, StorageBucket } from "./types.ts";
import { expiresAtFromToken, jpegPutHeaders, rewritePublicUrl } from "./url.ts";

const UPLOAD_TTL_SECONDS = 2 * 60 * 60;

export function createSupabaseMediaStore(options: {
  publicBaseUrl: string;
  bucket: StorageBucket;
}): MediaStore {
  const publicBaseUrl = options.publicBaseUrl;
  const bucket = options.bucket;

  return {
    async signUpload(key, contentType, _bytes): Promise<SignedUpload> {
      if (contentType !== "image/jpeg") {
        throw new Error("only image/jpeg uploads are signed");
      }
      const { data, error } = await bucket.createSignedUploadUrl(key, { upsert: false });
      if (error || !data?.signedUrl) {
        console.error("signUpload failed", key.split("/").at(-2) ?? "unknown");
        throw new Error("could not sign upload");
      }
      const url = rewritePublicUrl(data.signedUrl, publicBaseUrl);
      if (url.includes("kong:8000")) {
        throw new Error("signed upload URL was not rewritten");
      }
      return {
        url,
        method: "PUT",
        headers: jpegPutHeaders(),
        expiresAt: expiresAtFromToken(url, UPLOAD_TTL_SECONDS),
      };
    },

    async signViews(keys, ttlSeconds): Promise<Record<string, SignedView>> {
      if (keys.length === 0) return {};
      const { data, error } = await bucket.createSignedUrls(keys, ttlSeconds);
      if (error || !data) {
        console.error("signViews failed");
        throw new Error("could not sign views");
      }
      const out: Record<string, SignedView> = {};
      for (const item of data) {
        if (!item.path || !item.signedUrl || item.error) continue;
        const url = rewritePublicUrl(item.signedUrl, publicBaseUrl);
        if (url.includes("kong:8000")) {
          throw new Error("signed view URL was not rewritten");
        }
        out[item.path] = {
          url,
          expiresAt: expiresAtFromToken(url, ttlSeconds),
        };
      }
      return out;
    },

    async head(key) {
      const { data, error } = await bucket.info(key);
      if (error || !data) {
        const message = error?.message?.toLowerCase() ?? "";
        if (message.includes("not found") || message.includes("nosuchkey") || !data) {
          return null;
        }
      }
      if (!data || typeof data.size !== "number") return null;
      const fromMeta = data.metadata?.mimetype;
      const contentType = data.contentType ??
        (typeof fromMeta === "string" ? fromMeta : "");
      return { bytes: data.size, contentType };
    },

    async remove(keys) {
      if (keys.length === 0) return;
      const { error } = await bucket.remove(keys);
      if (error) {
        console.error("remove failed", keys.length);
        throw new Error("could not remove objects");
      }
    },
  };
}

export function supabaseStoreFromEnv(
  env: Record<string, string | undefined>,
): MediaStore {
  const publicBase = env.MEDIA_PUBLIC_BASE_URL;
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketName = env.MEDIA_BUCKET || "photos";
  if (!publicBase || !supabaseUrl || !serviceKey) {
    console.error("Supabase media store is missing URL configuration");
    throw new Error("Supabase media store is not configured");
  }
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return createSupabaseMediaStore({
    publicBaseUrl: publicBase,
    bucket: client.storage.from(bucketName),
  });
}
