import { AwsClient } from "aws4fetch";
import type { MediaStore, SignedUpload, SignedView } from "./types.ts";

const REQUIRED = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function readS3Config(env: Record<string, string | undefined>): S3Config {
  const missing = REQUIRED.filter((name) => !env[name]);
  if (missing.length > 0) {
    console.error(`S3 media store missing ${missing.join(", ")}`);
    throw new Error(`S3 media store missing ${missing.join(", ")}`);
  }
  return {
    endpoint: env.S3_ENDPOINT!.replace(/\/$/, ""),
    region: env.S3_REGION!,
    bucket: env.MEDIA_BUCKET || "photos",
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
  };
}

function objectUrl(config: S3Config, key: string): string {
  const encoded = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${config.endpoint}/${config.bucket}/${encoded}`;
}

function assertNoSecret(url: string, secret: string): void {
  if (secret && url.includes(secret)) {
    throw new Error("signed URL contained the secret access key");
  }
}

export function createS3MediaStore(config: S3Config, now = (): number => Date.now()): MediaStore {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
  });

  async function presign(
    method: "PUT" | "GET" | "HEAD" | "DELETE",
    key: string,
    headers: Record<string, string>,
    expiresSeconds: number,
  ): Promise<{ url: string; expiresAt: string }> {
    const unsigned = new URL(objectUrl(config, key));
    unsigned.searchParams.set("X-Amz-Expires", String(expiresSeconds));
    const request = new Request(unsigned, { method, headers });
    const signed = await aws.sign(request, {
      aws: { signQuery: true, allHeaders: true },
    });
    const url = signed.url;
    assertNoSecret(url, config.secretAccessKey);
    if (!url.startsWith(`${config.endpoint}/${config.bucket}/`)) {
      throw new Error("S3 URL is not path-style");
    }
    return {
      url,
      expiresAt: new Date(now() + expiresSeconds * 1000).toISOString(),
    };
  }

  return {
    async signUpload(key, contentType, bytes): Promise<SignedUpload> {
      const headers = {
        "content-type": contentType,
        "content-length": String(bytes),
        "cache-control": "max-age=31536000",
      };
      const signed = await presign("PUT", key, headers, 2 * 60 * 60);
      const params = new URL(signed.url).searchParams;
      const signedHeaders = (params.get("X-Amz-SignedHeaders") ?? "").toLowerCase();
      if (!signedHeaders.includes("content-type") || !signedHeaders.includes("content-length")) {
        throw new Error("presigned PUT did not sign content-type and content-length");
      }
      return {
        url: signed.url,
        method: "PUT",
        headers,
        expiresAt: signed.expiresAt,
      };
    },

    async signViews(keys, ttlSeconds) {
      const out: Record<string, SignedView> = {};
      for (const key of keys) {
        const signed = await presign("GET", key, {}, ttlSeconds);
        out[key] = signed;
      }
      return out;
    },

    async head(key) {
      const signed = await presign("HEAD", key, {}, 60);
      const response = await fetch(signed.url, { method: "HEAD" });
      if (response.status === 404) return null;
      if (!response.ok) {
        console.error("s3 head failed", response.status);
        throw new Error("could not read object");
      }
      const length = Number(response.headers.get("content-length") ?? "");
      const contentType = response.headers.get("content-type") ?? "";
      if (!Number.isFinite(length)) return null;
      return { bytes: length, contentType };
    },

    async remove(keys) {
      for (const key of keys) {
        const signed = await presign("DELETE", key, {}, 60);
        const response = await fetch(signed.url, { method: "DELETE" });
        if (!response.ok && response.status !== 404) {
          console.error("s3 delete failed", response.status);
          throw new Error("could not remove object");
        }
      }
    },
  };
}

export function s3StoreFromEnv(env: Record<string, string | undefined>): MediaStore {
  return createS3MediaStore(readS3Config(env));
}
