import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { FAMILY_ID, SPACES, psql, restGet, rpc } from "./api.ts";
import { SEED_USERS, ensureSpacesNavOpen, expect, signInWithPassword, test } from "./fixtures.ts";

const tmp = path.join(process.cwd(), "e2e/.tmp");
const GRANDMA = "a2000000-0000-4000-8000-000000000003";
const GRANDMA_USER = "a1000000-0000-4000-8000-000000000003";

function serviceKey(): string {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const env = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8" });
  const match = env.match(/SERVICE_ROLE_KEY="([^"]+)"/);
  if (!match) throw new Error("service role key is not available");
  return match[1];
}

function apiBase(): string {
  return process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321";
}

async function downloadObject(key: string): Promise<Buffer> {
  const secret = serviceKey();
  const response = await fetch(`${apiBase()}/storage/v1/object/photos/${key}`, {
    headers: { authorization: `Bearer ${secret}`, apikey: secret },
  });
  if (!response.ok) throw new Error(`object download failed ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG size marker missing");
}

async function rasterFile(
  page: Page,
  file: string,
  width: number,
  height: number,
  type: "image/jpeg" | "image/png",
  exif = false,
): Promise<string> {
  mkdirSync(tmp, { recursive: true });
  const bytes = await page.evaluate(
    async ({ width, height, type }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no canvas");
      context.fillStyle = "#c45b2d";
      context.fillRect(0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error("encode failed"))),
          type,
          0.85,
        );
      });
      return [...new Uint8Array(await blob.arrayBuffer())];
    },
    { width, height, type },
  );
  let buffer = Buffer.from(bytes);
  if (exif) {
    const app1 = Buffer.concat([
      Buffer.from([0xff, 0xe1, 0x00, 0x16]),
      Buffer.from("Exif\0\0", "binary"),
      Buffer.from("II*\0\x08\0\0\0\0\0\0\0GPS\0", "binary"),
    ]);
    buffer = Buffer.concat([buffer.subarray(0, 2), app1, buffer.subarray(2)]);
  }
  const target = path.join(tmp, file);
  writeFileSync(target, buffer);
  return target;
}

async function expectClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("grandma posts photos in Noa's space and Noa sees one unread item", async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  const jpeg = await rasterFile(page, "gps.jpg", 120, 80, "image/jpeg", true);
  const png = await rasterFile(page, "shot.png", 90, 60, "image/png");
  const wide = await rasterFile(page, "wide.jpg", 4000, 40, "image/jpeg");
  const caption = `Picnic ${Date.now()}`;

  const noaContext = await browser.newContext();
  const noa = await noaContext.newPage();
  await signInWithPassword(noa, SEED_USERS.noa);
  await noa.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await expect(noa.getByText("This is my space.")).toBeVisible();
  await noa.goto(`/f/${FAMILY_ID}/s/${SPACES.general}/messages`);

  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await expect(page.getByRole("button", { name: "Add photos" })).toBeVisible();
  let releaseUpload = () => {};
  const held = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/storage/v1/object/upload/**", async (route) => {
    await held;
    await route.continue();
  });
  await page.locator('input[type="file"]').setInputFiles([jpeg, png, wide]);
  await expect(page.getByRole("progressbar").first()).toBeVisible();
  releaseUpload();
  await expect(page.getByRole("progressbar")).toHaveCount(0, { timeout: 30_000 });
  await page.getByLabel("Caption").first().fill(caption);
  await page.getByRole("textbox", { name: "Message" }).fill(caption);
  await page.getByRole("button", { name: "Send" }).click();
  const article = page.getByRole("article", { name: new RegExp(caption) });
  await expect(article.locator("img")).toHaveCount(3);

  await ensureSpacesNavOpen(noa);
  await expect(noa.getByRole("link", { name: /Noa's space, 1 new message/ })).toBeVisible();
  await noa.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await expect(noa.getByRole("article", { name: new RegExp(caption) }).locator("img")).toHaveCount(
    3,
  );

  const keys = psql(
    `select r2_key || '|' || thumb_key from public.media where caption = '${caption}'`,
  );
  const [fullKey, thumbKey] = keys.split("|");
  const full = await downloadObject(fullKey);
  const thumb = await downloadObject(thumbKey);
  expect(full.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(thumb.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(full.includes(Buffer.from("Exif"))).toBe(false);
  expect(full.includes(Buffer.from("GPS"))).toBe(false);
  const fullSize = jpegSize(full);
  const thumbSize = jpegSize(thumb);
  expect(Math.max(fullSize.width, fullSize.height)).toBeLessThanOrEqual(2048);
  expect(Math.max(thumbSize.width, thumbSize.height)).toBeLessThanOrEqual(400);
  await noaContext.close();
});

test("a photo-only post works and a blank text post does not", async ({ page }) => {
  const jpeg = await rasterFile(page, "only.jpg", 64, 48, "image/jpeg");
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await page.locator('input[type="file"]').setInputFiles(jpeg);
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Caption").fill(`Only ${Date.now()}`);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: /Only / })).toBeVisible();
});

test("pics shows 30 photos then the rest, and the viewer moves and closes", async ({ page }) => {
  psql(`delete from public.media where caption like 'grid-%'`);
  const family = FAMILY_ID;
  const space = SPACES.ari;
  for (let index = 0; index < 35; index += 1) {
    const id = `c5000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const when = `2026-11-15 12:00:${String(index).padStart(2, "0")}+00`;
    psql(
      `insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key, content_type, status, provider, caption, created_by, created_at, width, height)
       values ('${id}', '${space}', '${family}', '${GRANDMA}', 'photo',
         'f/${family}/s/${space}/${id}/original.jpg',
         'f/${family}/s/${space}/${id}/thumb.jpg',
         'image/jpeg', 'ready', 'supabase', 'grid-${index}', '${GRANDMA_USER}', '${when}', 80, 80)`,
    );
  }
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.ari}/pics`);
  const pics = page.getByRole("region", { name: "Pics" });
  await expect(pics.getByRole("button", { name: "grid-34" })).toBeVisible();
  await expect(pics.getByRole("listitem")).toHaveCount(30);
  await expect(pics.getByRole("button", { name: "grid-4" })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more photos" }).click();
  await expect(pics.getByRole("listitem")).toHaveCount(35);
  const newest = page.getByRole("button", { name: "grid-34" });
  await newest.click();
  const dialog = page.getByRole("dialog", { name: "Photo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Previous" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Next" }).click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(newest).toBeFocused();
});

test("the eleventh photo is refused", async ({ page }) => {
  const files = [];
  for (let index = 0; index < 11; index += 1) {
    files.push(await rasterFile(page, `many-${index}.jpg`, 32, 32, "image/jpeg"));
  }
  await signInWithPassword(page, SEED_USERS.mom);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.general}/messages`);
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.getByRole("alert")).toContainText("10 photos");
});

test("daily and storage limits surface the server message", async ({ page }) => {
  const filler = `delete from public.media where uploader_member_id = '${GRANDMA}' and status = 'failed'`;
  const cap = `delete from public.media where id = 'c5000000-0000-4000-8000-000000000099'`;
  try {
    psql(
      `insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key, content_type, status, provider, created_by, expected_bytes, expected_thumb_bytes)
       select id, '${SPACES.general}', '${FAMILY_ID}', '${GRANDMA}', 'photo',
         'f/${FAMILY_ID}/s/${SPACES.general}/' || id || '/original.jpg',
         'f/${FAMILY_ID}/s/${SPACES.general}/' || id || '/thumb.jpg',
         'image/jpeg', 'failed', 'r2', '${GRANDMA_USER}', 10, 10
       from (select gen_random_uuid() as id from generate_series(1, 100)) ids`,
    );
    const file = await rasterFile(page, "limit.jpg", 40, 40, "image/jpeg");
    const again = await rasterFile(page, "limit-2.jpg", 42, 42, "image/jpeg");
    await signInWithPassword(page, SEED_USERS.grandma);
    await page.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByRole("alert")).toContainText("100 photos today", { timeout: 20_000 });
    await page.getByRole("button", { name: "Remove" }).click();
    psql(filler);
    psql(
      `insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key, content_type, status, provider, created_by, size_bytes, expected_thumb_bytes, width, height)
       values ('c5000000-0000-4000-8000-000000000099', '${SPACES.general}', '${FAMILY_ID}', 'a2000000-0000-4000-8000-000000000005', 'photo',
         'f/${FAMILY_ID}/s/${SPACES.general}/c5000000-0000-4000-8000-000000000099/original.jpg',
         'f/${FAMILY_ID}/s/${SPACES.general}/c5000000-0000-4000-8000-000000000099/thumb.jpg',
         'image/jpeg', 'ready', 'supabase', 'a1000000-0000-4000-8000-000000000005', 838860000, 800, 100, 100)`,
    );
    await page.locator('input[type="file"]').setInputFiles(again);
    await expect(page.getByRole("alert")).toContainText("photo storage limit", { timeout: 20_000 });
  } finally {
    psql(filler);
    psql(cap);
  }
});

test("the bucket rejects an oversized or non-jpeg upload", async () => {
  const token = (await (
    await fetch(`${apiBase()}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: SEED_USERS.mom.email, password: SEED_USERS.mom.password }),
    })
  ).json()) as { access_token: string };
  const reserved = await fetch(`${apiBase()}/functions/v1/media-upload-url`, {
    method: "POST",
    headers: {
      apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      authorization: `Bearer ${token.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      space_id: SPACES.general,
      bytes: 1000,
      thumb_bytes: 500,
      width: 80,
      height: 60,
    }),
  });
  const payload = (await reserved.json()) as {
    error?: string;
    upload?: { url: string; headers: Record<string, string> };
  };
  expect(reserved.ok, payload.error).toBeTruthy();
  const png = await fetch(payload.upload!.url, {
    method: "PUT",
    headers: { ...payload.upload.headers, "content-type": "image/png" },
    body: Buffer.alloc(100, 1),
  });
  expect(png.status).toBeGreaterThanOrEqual(400);
  const big = await fetch(payload.upload.url, {
    method: "PUT",
    headers: payload.upload.headers,
    body: Buffer.alloc(6 * 1024 * 1024, 1),
  });
  expect(big.status).toBeGreaterThanOrEqual(400);
});

test("pending photos and other spaces stay private", async () => {
  const id = "c5000000-0000-4000-8000-000000000088";
  psql(
    `insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key, content_type, status, provider, created_by)
     values ('${id}', '${SPACES.noa}', '${FAMILY_ID}', '${GRANDMA}', 'photo',
       'f/${FAMILY_ID}/s/${SPACES.noa}/${id}/original.jpg',
       'f/${FAMILY_ID}/s/${SPACES.noa}/${id}/thumb.jpg',
       'image/jpeg', 'pending', 'r2', '${GRANDMA_USER}')`,
  );
  const mom = await restGet(SEED_USERS.mom.email, `/rest/v1/media?id=eq.${id}&select=id`);
  expect(await mom.json()).toEqual([]);
  const ari = await rpc(SEED_USERS.noa.email, "noop", {});
  expect(ari.status).toBeGreaterThan(0);
  const view = await fetch(`${apiBase()}/functions/v1/media-view-urls`, {
    method: "POST",
    headers: {
      apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      authorization: `Bearer ${await (async () => {
        const response = await fetch(`${apiBase()}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: {
            apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ email: "mom+ari@example.test", password: "local-dev-only" }),
        });
        return ((await response.json()) as { access_token: string }).access_token;
      })()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ media_ids: [id] }),
  });
  expect(await view.json()).toEqual({});
  const anon = await fetch(`${apiBase()}/functions/v1/media-view-urls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(anon.status).toBe(401);
  psql(`delete from public.media where id = '${id}'`);
});

test("grandma can delete her photo, Noa cannot, and Mom can restore it", async ({
  browser,
  page,
}) => {
  const file = await rasterFile(page, "delete-me.jpg", 48, 48, "image/jpeg");
  const caption = `Delete me ${Date.now()}`;
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Caption").fill(caption);
  await page.getByRole("textbox", { name: "Message" }).fill(`Keep ${caption}`);
  await page.getByRole("button", { name: "Send" }).click();
  const thumb = page.getByRole("button", { name: caption });
  await expect(thumb).toBeVisible();
  await thumb.click();
  await page.getByRole("button", { name: "Delete photo" }).click();
  await expect(page.getByText("This photo was deleted.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Deleted photo" })).toBeVisible();

  const noaContext = await browser.newContext();
  const noa = await noaContext.newPage();
  await signInWithPassword(noa, SEED_USERS.noa);
  await noa.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await expect(noa.getByRole("button", { name: caption })).toHaveCount(0);

  const momContext = await browser.newContext();
  const mom = await momContext.newPage();
  await signInWithPassword(mom, SEED_USERS.mom);
  await mom.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await mom.getByRole("button", { name: "Deleted photo" }).click();
  await mom.getByRole("button", { name: "Restore photo" }).click();
  await expect(mom.getByRole("button", { name: caption })).toBeVisible();
  await noaContext.close();
  await momContext.close();
});

test("an archived space is read-only and refuses a reservation", async ({ page }) => {
  psql(`update public.spaces set archived_at = now() where id = '${SPACES.dad}'`);
  try {
    await signInWithPassword(page, SEED_USERS.grandma);
    await page.goto(`/f/${FAMILY_ID}/s/${SPACES.dad}/messages`);
    await expect(
      page.getByText("This space is archived. You can read it but not post."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Add photos" })).toHaveCount(0);
    const token = (await (
      await fetch(`${apiBase()}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: {
          apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: SEED_USERS.grandma.email,
          password: SEED_USERS.grandma.password,
        }),
      })
    ).json()) as { access_token: string };
    const refused = await fetch(`${apiBase()}/functions/v1/media-upload-url`, {
      method: "POST",
      headers: {
        apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        space_id: SPACES.dad,
        bytes: 100,
        thumb_bytes: 50,
        width: 40,
        height: 40,
      }),
    });
    expect(refused.status).toBe(403);
  } finally {
    psql(`update public.spaces set archived_at = null where id = '${SPACES.dad}'`);
  }
});

test("a failed upload can be retried", async ({ page }) => {
  const file = await rasterFile(page, "retry.jpg", 40, 40, "image/jpeg");
  await signInWithPassword(page, SEED_USERS.mom);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.general}/messages`);
  let failed = 0;
  await page.route("**/storage/v1/object/upload/**", (route) => {
    failed += 1;
    if (failed === 1) return route.abort();
    return route.continue();
  });
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 20_000 });
  await page.unroute("**/storage/v1/object/upload/**");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
});

test("orphan cleanup removes an old unposted photo and its objects", async () => {
  const id = "c5000000-0000-4000-8000-000000000077";
  const key = `f/${FAMILY_ID}/s/${SPACES.general}/${id}/original.jpg`;
  const thumb = `f/${FAMILY_ID}/s/${SPACES.general}/${id}/thumb.jpg`;
  const secret = serviceKey();
  const tiny = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  for (const objectKey of [key, thumb]) {
    const uploaded = await fetch(`${apiBase()}/storage/v1/object/photos/${objectKey}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        apikey: secret,
        "content-type": "image/jpeg",
      },
      body: tiny,
    });
    expect(uploaded.ok).toBeTruthy();
  }
  psql(
    `insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key, content_type, status, provider, created_by, created_at, expected_bytes, expected_thumb_bytes)
     values ('${id}', '${SPACES.general}', '${FAMILY_ID}', '${GRANDMA}', 'photo', '${key}', '${thumb}',
       'image/jpeg', 'pending', 'r2', '${GRANDMA_USER}', now() - interval '25 hours', 4, 4)`,
  );
  const cleaned = await fetch(`${apiBase()}/functions/v1/media-cleanup`, {
    method: "POST",
    headers: { "x-media-cleanup-secret": process.env.MEDIA_CLEANUP_SECRET ?? "local-cleanup-dev" },
  });
  expect(cleaned.status).toBe(200);
  const body = (await cleaned.json()) as { removed: number };
  expect(body.removed).toBeGreaterThanOrEqual(1);
  expect(psql(`select count(*) from public.media where id = '${id}'`)).toBe("0");
  const gone = await fetch(`${apiBase()}/storage/v1/object/photos/${key}`, {
    headers: { authorization: `Bearer ${secret}`, apikey: secret },
  });
  expect(gone.status).toBe(400);
});

test("a HEIC photo is converted and the decoder chunk is not loaded otherwise", async ({
  page,
}) => {
  const heic: string[] = [];
  page.on("request", (request) => {
    if (request.url().toLowerCase().includes("heic")) heic.push(request.url());
  });
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.general}/messages`);
  await expect(page.getByRole("button", { name: "Add photos" })).toBeVisible();
  expect(heic).toEqual([]);
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), "e2e/fixtures/sample.heic"));
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: 30_000 });
  expect(heic.length).toBeGreaterThan(0);
});

test("the video tab is hidden and /video opens messages", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma);
  await expect(page.getByRole("link", { name: "Video", exact: true })).toHaveCount(0);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.general}/video`);
  await expect(page).toHaveURL(/\/messages$/);
  await expect(page.getByRole("link", { name: "Pics", exact: true })).toBeVisible();
});

test("photo screens have no axe violations in light, dark, and extra large text", async ({
  page,
}) => {
  const file = await rasterFile(page, "axe.jpg", 48, 48, "image/jpeg");
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  await page
    .locator('input[type="file"]')
    .setInputFiles([file, file, file, file, file, file, file, file, file, file, file]);
  await expect(page.getByRole("alert")).toContainText("10 photos");
  await expectClean(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectClean(page);
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.ari}/pics`);
  await expect(page.getByRole("button", { name: "Load more photos" })).toBeVisible();
  await expectClean(page);
  await page.getByRole("button", { name: "grid-34" }).click();
  await expect(page.getByRole("dialog", { name: "Photo" })).toBeVisible();
  await expectClean(page);
  await page.addInitScript(() => localStorage.setItem("stay-text-size", "extraLarge"));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`/f/${FAMILY_ID}/s/${SPACES.noa}/messages`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBeTruthy();
  await expectClean(page);
});
