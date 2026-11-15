import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import { AwsClient } from "aws4fetch";
import { getMediaStore } from "./index.ts";
import { createS3MediaStore, readS3Config } from "./s3.ts";
import { createSupabaseMediaStore } from "./supabase.ts";
import type { StorageBucket } from "./types.ts";
import { expiresAtFromToken, rewritePublicUrl } from "./url.ts";

const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

function s3Env(): Record<string, string> {
  return {
    MEDIA_PROVIDER: "r2",
    MEDIA_BUCKET: "photos",
    S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "AKIDEXAMPLE",
    S3_SECRET_ACCESS_KEY: SECRET,
  };
}

Deno.test("getMediaStore rejects a missing or unknown provider", () => {
  assertThrows(() => getMediaStore({}), Error, "MEDIA_PROVIDER is missing");
  assertThrows(() => getMediaStore({ MEDIA_PROVIDER: "box" }), Error, "Unknown MEDIA_PROVIDER");
});

Deno.test("getMediaStore selects supabase and requires S3 settings for r2 and b2", () => {
  const store = getMediaStore({
    MEDIA_PROVIDER: "supabase",
    MEDIA_BUCKET: "photos",
    MEDIA_PUBLIC_BASE_URL: "http://127.0.0.1:54321",
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
  });
  assertEquals(typeof store.signUpload, "function");
  assertThrows(
    () => getMediaStore({ MEDIA_PROVIDER: "r2", MEDIA_BUCKET: "photos" }),
    Error,
    "S3_ENDPOINT",
  );
  assertThrows(
    () => getMediaStore({ ...s3Env(), MEDIA_PROVIDER: "b2", S3_REGION: "" }),
    Error,
    "S3_REGION",
  );
  assertEquals(readS3Config(s3Env()).region, "auto");
});

Deno.test("rewritePublicUrl never leaves the Docker hostname in place", () => {
  const rewritten = rewritePublicUrl(
    "http://kong:8000/storage/v1/object/sign/photos/a.jpg?token=abc",
    "http://127.0.0.1:54321",
  );
  assertStringIncludes(rewritten, "http://127.0.0.1:54321/storage/v1/");
  assertEquals(rewritten.includes("kong:8000"), false);
});

function token(exp: number): string {
  const payload = btoa(JSON.stringify({ exp })).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
  return `hdr.${payload}.sig`;
}

Deno.test("expiresAtFromToken reads the upload token exp claim", () => {
  const exp = 1_800_000_000;
  const url = `http://127.0.0.1:54321/storage/v1/object/upload/sign/photos/a.jpg?token=${
    token(exp)
  }`;
  assertEquals(expiresAtFromToken(url, 60), new Date(exp * 1000).toISOString());
});

Deno.test("supabase signUpload rewrites the host and signViews batches keys", async () => {
  const bucket: StorageBucket = {
    createSignedUploadUrl: (path) =>
      Promise.resolve({
        data: {
          signedUrl: `http://kong:8000/storage/v1/object/upload/sign/photos/${path}?token=${
            token(1_800_000_000)
          }`,
        },
        error: null,
      }),
    createSignedUrls: (paths) =>
      Promise.resolve({
        data: paths.map((path) => ({
          path,
          signedUrl: `http://kong:8000/storage/v1/object/sign/photos/${path}?token=${
            token(1_700_000_000)
          }`,
          error: null,
        })),
        error: null,
      }),
    info: () => Promise.resolve({ data: null, error: { message: "Object not found" } }),
    remove: () => Promise.resolve({ data: [], error: null }),
  };
  const store = createSupabaseMediaStore({
    publicBaseUrl: "http://127.0.0.1:54321",
    bucket,
  });
  const upload = await store.signUpload("f/a/s/b/c/original.jpg", "image/jpeg", 1200);
  assertStringIncludes(upload.url, "http://127.0.0.1:54321/");
  assertEquals(upload.url.includes("kong:8000"), false);
  assertEquals(upload.method, "PUT");
  assertEquals(upload.headers["content-type"], "image/jpeg");
  assertEquals(upload.headers["cache-control"], "max-age=31536000");
  const views = await store.signViews(["full.jpg", "thumb.jpg"], 3600);
  assertEquals(Object.keys(views).sort(), ["full.jpg", "thumb.jpg"]);
  assertEquals(views["full.jpg"].url.includes("kong:8000"), false);
  assertEquals(await store.head("missing.jpg"), null);
});

Deno.test("s3 presign is path-style, signs content-type and length, and hides the secret", async () => {
  const store = createS3MediaStore(readS3Config(s3Env()), () => Date.parse("2026-11-15T12:00:00Z"));
  const upload = await store.signUpload("f/fam/s/space/id/original.jpg", "image/jpeg", 4096);
  const url = new URL(upload.url);
  assertEquals(url.host, "example.r2.cloudflarestorage.com");
  assertStringIncludes(url.pathname, "/photos/f/fam/s/space/id/original.jpg");
  assertEquals(url.hostname.startsWith("photos."), false);
  const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").toLowerCase();
  assertStringIncludes(signed, "content-type");
  assertStringIncludes(signed, "content-length");
  assertEquals(url.searchParams.get("X-Amz-Expires"), "7200");
  assertEquals(
    upload.expiresAt,
    new Date(Date.parse("2026-11-15T12:00:00Z") + 7200 * 1000).toISOString(),
  );
  assertEquals(upload.url.includes(SECRET), false);
  assertStringIncludes(upload.url, "X-Amz-Signature=");
  const view = await store.signViews(["f/fam/s/space/id/thumb.jpg"], 3600);
  assertEquals(
    new URL(view["f/fam/s/space/id/thumb.jpg"].url).searchParams.get("X-Amz-Expires"),
    "3600",
  );
  assertEquals(view["f/fam/s/space/id/thumb.jpg"].url.includes(SECRET), false);

  const probe = new AwsClient({
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: SECRET,
    service: "s3",
    region: "auto",
  });
  assertEquals(typeof probe.sign, "function");
});

Deno.test("readS3Config rejects a partial environment", () => {
  assertThrows(() => readS3Config({ S3_ENDPOINT: "https://example" }), Error, "S3_REGION");
});
