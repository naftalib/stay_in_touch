import type { MediaStore } from "./types.ts";
import { s3StoreFromEnv } from "./s3.ts";
import { supabaseStoreFromEnv } from "./supabase.ts";

export type { MediaStore, SignedUpload, SignedView } from "./types.ts";

export function getMediaStore(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): MediaStore {
  const provider = env.MEDIA_PROVIDER?.trim();
  if (!provider) {
    console.error("MEDIA_PROVIDER is missing");
    throw new Error("MEDIA_PROVIDER is missing");
  }
  if (provider === "supabase") return supabaseStoreFromEnv(env);
  if (provider === "r2" || provider === "b2") return s3StoreFromEnv(env);
  console.error(`Unknown MEDIA_PROVIDER: ${provider}`);
  throw new Error(`Unknown MEDIA_PROVIDER: ${provider}`);
}
