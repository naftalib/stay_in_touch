import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, signInWithPassword, signOutFromApp, SEED_USERS } from "./fixtures.ts";
import { FAMILY_ID, MEMBERS, psql, SPACES } from "./api.ts";

const production = Boolean(process.env.CI || process.env.PWA_E2E);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOA_SPACE = SPACES.noa;
const MOM = "a2000000-0000-4000-8000-000000000001";
const GRANDMA = "a2000000-0000-4000-8000-000000000003";
const GRANDMA_USER = "a1000000-0000-4000-8000-000000000003";

function insertGrandmaPost(id: string, body: string) {
  // space_viewer_member_ids is scoped to the caller's memberships. A superuser
  // insert with no JWT notifies nobody, so the post runs as Grandma.
  psql(`
    select set_config('request.jwt.claim.sub', '${GRANDMA_USER}', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    select set_config(
      'request.jwt.claims',
      '{"sub":"${GRANDMA_USER}","role":"authenticated"}',
      true
    );
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      '${id}',
      '${NOA_SPACE}',
      '${FAMILY_ID}',
      '${GRANDMA}',
      '${body}',
      '${GRANDMA_USER}'
    );
  `);
}

function skipWithoutWorker(title: string) {
  test.skip(!production, `${title} needs the production service worker (CI or PWA_E2E)`);
}

test("install help explains the three Home Screen steps", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Add Stay In Touch to your Home Screen" })).toBeVisible();
  await expect(page.getByText("Tap Share in Safari.")).toBeVisible();
  await expect(page.getByText("Tap Add to Home Screen.")).toBeVisible();
  await expect(page.getByText("Open Stay In Touch from the new icon.")).toBeVisible();
  await expect(
    page.getByText("notifications only work when you open the app from the Home Screen"),
  ).toBeVisible();
});

test("Chromium can offer install from beforeinstallprompt", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "beforeinstallprompt is a Chromium-only event",
  );
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "dismissed" }),
      });
      window.dispatchEvent(event);
    });
  });
  await signInWithPassword(page, SEED_USERS.grandma);
  await expect(page.getByText("Install Stay In Touch on this device.")).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Install Stay In Touch on this device.")).toBeHidden();
});

test("a draft survives reload and send stays disabled offline", async ({ page }) => {
  await signInWithPassword(page, SEED_USERS.mom);
  const composer = page.getByRole("main").getByRole("textbox", { name: "Message" });
  await composer.fill("Saved while the train went through a tunnel");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith("sit-draft:") && localStorage.getItem(key)?.includes("tunnel")),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(composer).toHaveValue("Saved while the train went through a tunnel");
  await page.context().setOffline(true);
  await expect(
    page.getByText(
      "You're offline. Your message is saved and you can send it when you're back online.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
});

test("notification settings and install help have no axe violations", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("stay-text-size", "extraLarge");
  });
  await signInWithPassword(page, SEED_USERS.grandma);
  await page.goto(`/f/${FAMILY_ID}/notifications`);
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  const analyze = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
  expect((await analyze()).violations).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect((await analyze()).violations).toEqual([]);
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Add Stay In Touch to your Home Screen" })).toBeVisible();
  expect((await analyze()).violations).toEqual([]);
});

test("the manifest and worker do not cache the API", async ({ page }) => {
  skipWithoutWorker("manifest");
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const body = (await manifest.json()) as { name: string; display: string; start_url: string };
  expect(body.name).toBe("Stay In Touch");
  expect(body.display).toBe("standalone");
  expect(body.start_url).toBe("/");
  const worker = await page.request.get("/sw.js");
  const source = await worker.text();
  expect(source).toContain("denylist");
  expect(source).toContain("rest");
  expect(source).toContain("functions");
  expect(source).not.toContain("heic-to");
  const shell = await page.request.get("/sw.js");
  expect(shell.headers()["cache-control"]).toContain("no-cache");
});

test("a waiting worker asks before it reloads", async ({ page }) => {
  skipWithoutWorker("update prompt");
  await signInWithPassword(page, SEED_USERS.mom);
  const file = path.join(root, "web/dist/sw.js");
  const original = readFileSync(file, "utf8");
  writeFileSync(file, `${original}\n// e2e update ${Date.now()}\n`);
  try {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect(page.getByText("A new version of Stay In Touch is ready.")).toBeVisible();
    const composer = page.getByRole("main").getByRole("textbox", { name: "Message" });
    await composer.fill("Hold the update");
    await expect(page.getByText("A new version of Stay In Touch is ready.")).toBeHidden();
    await composer.fill("");
    await expect(page.getByText("A new version of Stay In Touch is ready.")).toBeVisible();
    await page.getByRole("button", { name: "Later" }).click();
    await expect(page.getByText("A new version of Stay In Touch is ready.")).toBeHidden();
  } finally {
    writeFileSync(file, original);
  }
});

test("push names the space, skips the author, and opens the thread", async ({ page }, testInfo) => {
  skipWithoutWorker("push delivery");
  test.skip(testInfo.project.name !== "chromium", "service worker CDP is Chromium-only");
  const endpoint = `https://push.example.test/e2e-${Date.now()}`;
  await page.addInitScript((device: string) => {
    const keys = { p256dh: "e2e-p256dh", auth: "e2e-auth" };
    const subscription = {
      endpoint: device,
      options: { userVisibleOnly: true, applicationServerKey: null },
      getKey: () => null,
      toJSON: () => ({ endpoint: device, keys }),
      unsubscribe: () => Promise.resolve(true),
    };
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      get: () => "granted",
    });
    Notification.requestPermission = () => Promise.resolve("granted");
    PushManager.prototype.subscribe = () => Promise.resolve(subscription as unknown as PushSubscription);
    PushManager.prototype.getSubscription = () => Promise.resolve(null);
  }, endpoint);
  await page.context().grantPermissions(["notifications"], { origin: "http://127.0.0.1:5173" });
  await signInWithPassword(page, SEED_USERS.mom);
  await expect
    .poll(() => psql(`select user_id::text from public.push_subscriptions where endpoint = '${endpoint}'`))
    .toBe("a1000000-0000-4000-8000-000000000001");

  await signOutFromApp(page);
  await signInWithPassword(page, SEED_USERS.noa);
  await expect
    .poll(() => psql(`select user_id::text from public.push_subscriptions where endpoint = '${endpoint}'`))
    .toBe("a1000000-0000-4000-8000-000000000005");

  const messageId = "a4000000-0000-4000-8000-000000000906";
  insertGrandmaPost(messageId, "marker-zz-not-in-push");
  const labels = psql(`
    select coalesce(string_agg(fm.label, ',' order by fm.label), '')
    from public.notification_outbox o
    join public.family_members fm on fm.id = o.recipient_member_id
    where o.ref_id = '${messageId}';
  `);
  expect(labels.split(",").sort()).toEqual(["Dad", "Grandpa", "Mom", "Noa"].sort());
  expect(labels).not.toContain("Ari");
  expect(labels).not.toContain("Grandma");
  const stored = psql(`select coalesce(sent_payload::text, '') || coalesce(skip_reason, '') from public.notification_outbox where ref_id = '${messageId}'`);
  expect(stored).not.toContain("marker-zz-not-in-push");

  // push-send uses the service role, which has no auth.uid(). The captured
  // row is what that path stored, not a payload built in the test. Older
  // pending rows are claimed first, so repeat until this post is sent.
  let pushText = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pushResponse = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/push-send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-push-send-secret": process.env.PUSH_SEND_SECRET ?? "local-push-dev",
      },
      body: "{}",
    });
    pushText = await pushResponse.text();
    expect(pushResponse.status, pushText).toBe(200);
    const status = psql(
      `select status from public.notification_outbox where ref_id = '${messageId}' and recipient_member_id = '${MEMBERS.noa}'`,
    );
    if (status === "sent") break;
  }
  expect(pushText).not.toContain("marker-zz-not-in-push");
  const captured = psql(
    `select coalesce(sent_payload::text, '') from public.notification_outbox where ref_id = '${messageId}' and recipient_member_id = '${MEMBERS.noa}'`,
  );
  expect(captured).toContain("Grandma posted in Noa");
  expect(captured).toContain(`/f/${FAMILY_ID}/s/${NOA_SPACE}/messages`);
  expect(captured).not.toContain("marker-zz-not-in-push");
  expect(captured).not.toContain("kong:8000");
  expect(
    psql(
      `select status from public.notification_outbox where ref_id = '${messageId}' and recipient_member_id = '${MEMBERS.noa}'`,
    ),
  ).toBe("sent");

  psql(`delete from public.notification_outbox where recipient_member_id = '${MOM}' and ref_id = '${messageId}'`);
  await signOutFromApp(page);
  await signInWithPassword(page, SEED_USERS.mom);
  await page.goto(`/f/${FAMILY_ID}/notifications`);
  const noaSwitch = page.locator("main").getByRole("switch", { name: "Noa" });
  await noaSwitch.focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#settings-status")).toHaveText("Saved");
  await expect(noaSwitch).not.toBeChecked();
  const muted = "a4000000-0000-4000-8000-000000000907";
  insertGrandmaPost(muted, "muted check");
  const momRows = psql(
    `select count(*) from public.notification_outbox where ref_id = '${muted}' and recipient_member_id = '${MOM}'`,
  );
  expect(momRows).toBe("0");

  const session = await page.context().newCDPSession(page);
  const registrationId = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("service worker registration was not reported")), 15_000);
    session.on("ServiceWorker.workerRegistrationUpdated", (event) => {
      const found = (
        event as { registrations?: { registrationId: string; isDeleted?: boolean }[] }
      ).registrations?.find((item) => !item.isDeleted);
      if (!found) return;
      clearTimeout(timer);
      resolve(found.registrationId);
    });
    void session.send("ServiceWorker.enable").catch(reject);
  });
  expect(registrationId).toBeTruthy();
  const target = `http://127.0.0.1:5173/f/${FAMILY_ID}/s/${NOA_SPACE}/messages`;
  await session.send("ServiceWorker.deliverPushMessage", {
    origin: "http://127.0.0.1:5173",
    registrationId,
    data: captured,
  });
  const shown = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const items = await registration.getNotifications();
    return items.map((item) => ({ title: item.title, body: item.body, tag: item.tag }));
  });
  expect(shown).toEqual([
    expect.objectContaining({
      title: "Stay In Touch",
      body: "Grandma posted in Noa",
      tag: `space:${NOA_SPACE}`,
    }),
  ]);
  await page.evaluate((url: string) => {
    return navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "NOTIFICATION_CLICK", url });
    });
  }, target);
  await expect(page).toHaveURL(new RegExp(`/s/${NOA_SPACE}/messages`));
});
