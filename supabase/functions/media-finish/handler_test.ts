import { assertEquals } from "@std/assert";
import { handleMediaFinish, type MediaRow } from "./handler.ts";
import type { MediaStore } from "../_shared/media/types.ts";

const MEDIA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SERVICE_KEY = "service-role-should-never-leak";

function row(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: MEDIA,
    status: "pending",
    r2_key: "f/fam/s/space/id/original.jpg",
    thumb_key: "f/fam/s/space/id/thumb.jpg",
    expected_bytes: 1000,
    expected_thumb_bytes: 200,
    ...overrides,
  };
}

function deps(options: {
  row: MediaRow | null;
  original?: { bytes: number; contentType: string } | null;
  thumb?: { bytes: number; contentType: string } | null;
}) {
  const removed: string[][] = [];
  const calls: string[] = [];
  const store: MediaStore = {
    signUpload: () => Promise.reject(new Error("unused")),
    signViews: () => Promise.resolve({}),
    head: (key) => {
      if (key.endsWith("thumb.jpg")) {
        return Promise.resolve(
          options.thumb === undefined ? { bytes: 200, contentType: "image/jpeg" } : options.thumb,
        );
      }
      return Promise.resolve(
        options.original === undefined
          ? { bytes: 1000, contentType: "image/jpeg" }
          : options.original,
      );
    },
    remove: (keys) => {
      removed.push(keys);
      return Promise.resolve();
    },
  };
  return {
    removed,
    calls,
    response: handleMediaFinish(
      new Request("http://localhost/media-finish", {
        method: "POST",
        headers: { authorization: "Bearer user", "content-type": "application/json" },
        body: JSON.stringify({ media_id: MEDIA }),
      }),
      {
        loadMedia: () => Promise.resolve({ data: options.row, error: null }),
        markReady: () => {
          calls.push("mark_media_ready");
          return Promise.resolve({ error: null });
        },
        markFailed: () => {
          calls.push("mark_media_failed");
          return Promise.resolve({ error: null });
        },
        store,
        provider: "supabase",
      },
    ),
  };
}

Deno.test("media-finish marks ready when both objects match the reservation", async () => {
  const test = deps({ row: row() });
  const response = await test.response;
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { media_id: MEDIA, status: "ready" });
  assertEquals(test.calls, ["mark_media_ready"]);
  assertEquals(JSON.stringify(test.calls).includes(SERVICE_KEY), false);
});

Deno.test("media-finish deletes objects and marks failed when the size or type differs", async () => {
  const test = deps({
    row: row(),
    original: { bytes: 50, contentType: "image/png" },
  });
  const response = await test.response;
  const text = await response.text();
  assertEquals(response.status, 200);
  assertEquals(JSON.parse(text), { media_id: MEDIA, status: "failed" });
  assertEquals(test.removed.length, 1);
  assertEquals(test.calls, ["mark_media_failed"]);
  assertEquals(text.includes(SERVICE_KEY), false);
  assertEquals(text.includes("original.jpg"), false);
});
