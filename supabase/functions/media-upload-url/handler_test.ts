import { assertEquals, assertStringIncludes } from "@std/assert";
import { handleMediaUploadUrl } from "./handler.ts";
import type { MediaStore } from "../_shared/media/types.ts";

const SPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVICE_KEY = "service-role-should-never-leak";

function store(): MediaStore {
  return {
    signUpload: (key) =>
      Promise.resolve({
        url:
          `http://127.0.0.1:54321/storage/v1/object/upload/sign/photos/${key}?token=upload-token`,
        method: "PUT" as const,
        headers: { "content-type": "image/jpeg", "cache-control": "max-age=31536000" },
        expiresAt: "2026-11-15T14:00:00.000Z",
      }),
    signViews: () => Promise.resolve({}),
    head: () => Promise.resolve(null),
    remove: () => Promise.resolve(),
  };
}

const deps = {
  provider: "supabase" as const,
};

function request(body: unknown, auth = "Bearer user"): Request {
  return new Request("http://localhost/media-upload-url", {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("media-upload-url returns signed targets and not storage keys", async () => {
  let reserved: Record<string, unknown> | undefined;
  const response = await handleMediaUploadUrl(
    request({
      space_id: SPACE,
      bytes: 1200,
      thumb_bytes: 400,
      width: 800,
      height: 600,
      caption: "Picnic",
    }),
    {
      supabase: {
        rpc: (_fn, args) => {
          reserved = args;
          return Promise.resolve({
            data: [{
              media_id: MEDIA,
              key: "f/fam/s/space/id/original.jpg",
              thumb_key: "f/fam/s/space/id/thumb.jpg",
            }],
            error: null,
          });
        },
      },
      store: store(),
      provider: deps.provider,
    },
  );
  const text = await response.text();
  assertEquals(response.status, 200);
  assertEquals(text.includes(SERVICE_KEY), false);
  assertEquals(JSON.parse(text).key, undefined);
  const json = JSON.parse(text);
  assertEquals(json.media_id, MEDIA);
  assertEquals(json.upload.method, "PUT");
  assertStringIncludes(json.upload.url, "127.0.0.1:54321");
  assertEquals(reserved?.p_provider, "supabase");
});

Deno.test("media-upload-url maps a posting refusal to a generic 403", async () => {
  const response = await handleMediaUploadUrl(
    request({
      space_id: SPACE,
      bytes: 1200,
      thumb_bytes: 400,
      width: 800,
      height: 600,
    }),
    {
      supabase: {
        rpc: () =>
          Promise.resolve({
            data: null,
            error: { code: "42501", message: "you cannot post in this space" },
          }),
      },
      store: store(),
      provider: "supabase",
    },
  );
  assertEquals(response.status, 403);
  assertEquals(await response.json(), { error: "You can't add a photo here." });
});

Deno.test("media-upload-url without a JWT is 401", async () => {
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  );
  const { default: handler } = await import("./index.ts");
  const response = await handler.fetch(
    new Request("http://localhost/media-upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  const text = await response.text();
  if (response.status !== 401) console.error(text);
  assertEquals(response.status, 401);
  assertEquals(text.includes("service_role"), false);
});
