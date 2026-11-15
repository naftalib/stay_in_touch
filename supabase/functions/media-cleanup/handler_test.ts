import { assertEquals } from "@std/assert";
import { handleMediaCleanup } from "./handler.ts";
import type { MediaStore } from "../_shared/media/types.ts";

const SECRET = "local-cleanup-dev";

function call(header?: string) {
  const removed: string[][] = [];
  const store: MediaStore = {
    signUpload: () => Promise.reject(new Error("unused")),
    signViews: () => Promise.resolve({}),
    head: () => Promise.resolve(null),
    remove: (keys) => {
      removed.push(keys);
      return Promise.resolve();
    },
  };
  const response = handleMediaCleanup(
    new Request("http://localhost/media-cleanup", {
      method: "POST",
      headers: header ? { "x-media-cleanup-secret": header } : {},
    }),
    {
      secret: SECRET,
      supabaseAdmin: {
        rpc: (fn) => {
          if (fn === "list_photo_orphans") {
            return Promise.resolve({
              data: [{
                media_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                object_key: "full.jpg",
                thumb_key: "thumb.jpg",
              }],
              error: null,
            });
          }
          return Promise.resolve({ data: 1, error: null });
        },
      },
      store,
    },
  );
  return { response, removed };
}

Deno.test("media-cleanup refuses calls without the secret", async () => {
  const missing = await call().response;
  assertEquals(missing.status, 401);
  const wrong = await call("nope").response;
  assertEquals(wrong.status, 401);
});

Deno.test("media-cleanup removes orphan objects when the secret matches", async () => {
  const test = call(SECRET);
  const response = await test.response;
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { removed: 1 });
  assertEquals(test.removed, [["full.jpg", "thumb.jpg"]]);
});

Deno.test("media-cleanup reports misconfiguration when no secret is set", async () => {
  const response = await handleMediaCleanup(
    new Request("http://localhost/media-cleanup", { method: "POST" }),
    {
      secret: undefined,
      supabaseAdmin: { rpc: () => Promise.resolve({ data: [], error: null }) },
      store: {
        signUpload: () => Promise.reject(new Error("unused")),
        signViews: () => Promise.resolve({}),
        head: () => Promise.resolve(null),
        remove: () => Promise.resolve(),
      },
    },
  );
  assertEquals(response.status, 500);
});
