import { assert, assertEquals, assertThrows } from "@std/assert";
import { exportVapidKeys, generateVapidKeys } from "@negrel/webpush";
import { buildPushPayload, notificationBody, publicAppUrl } from "./payload.ts";
import { getPushSender } from "./index.ts";

const MARKER = "zz-secret-body-marker-zz";

Deno.test("notification body names who and where, then counts", () => {
  assertEquals(notificationBody(["Grandma"], 1, "Noa's space"), "Grandma posted in Noa's space");
  assertEquals(
    notificationBody(["Grandma", "Dad"], 2, "Noa's space"),
    "Grandma and Dad posted in Noa's space",
  );
  assertEquals(
    notificationBody(["Grandma", "Dad", "Mom"], 3, "Noa's space"),
    "3 new posts in Noa's space",
  );
  assertEquals(
    notificationBody(["Grandma", "Grandma"], 2, "Noa's space"),
    "Grandma posted in Noa's space",
  );
});

Deno.test("payload never contains message text and uses the public origin", () => {
  const payload = buildPushPayload({
    authors: ["Grandma"],
    postCount: 1,
    spaceTitle: "Noa's space",
    familyId: "fam",
    spaceId: "space",
    appUrl: "http://127.0.0.1:5173/",
    appBadge: 4,
  });
  const text = JSON.stringify({ payload, ignored: MARKER });
  assertEquals(payload.notification.body.includes(MARKER), false);
  assertEquals(JSON.stringify(payload).includes(MARKER), false);
  assert(text.includes(MARKER));
  assertEquals(payload.notification.navigate, "http://127.0.0.1:5173/f/fam/s/space/messages");
  assertEquals(payload.notification.tag, "space:space");
  assertEquals(payload.app_badge, 4);
  assertEquals(payload.web_push, 8030);
  assertEquals(payload.notification.lang, "en");
  assertEquals(payload.notification.dir, "ltr");
  assertThrows(() => publicAppUrl("http://kong:8000"));
});

Deno.test("getPushSender rejects a missing or unknown transport", () => {
  assertThrows(() => getPushSender({}), Error, "PUSH_TRANSPORT is missing");
  assertThrows(() => getPushSender({ PUSH_TRANSPORT: "smtp" }), Error, "Unknown PUSH_TRANSPORT");
});

Deno.test("webpush transport requires the VAPID variables", () => {
  assertThrows(
    () => getPushSender({ PUSH_TRANSPORT: "webpush" }),
    Error,
    "VAPID_PUBLIC_KEY is missing",
  );
});

Deno.test("capture transport returns 201 without a network call", async () => {
  const sender = getPushSender({ PUSH_TRANSPORT: "capture" });
  const result = await sender.send(
    { endpoint: "https://push.example.test/device", p256dh: "k", auth: "a" },
    "{}",
    { ttl: 86400, urgency: "normal" },
  );
  assertEquals(result.status, 201);
});

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

Deno.test("webpush builds an aes128gcm request with VAPID and TTL", async () => {
  const vapid = await generateVapidKeys({ extractable: true });
  const exported = await exportVapidKeys(vapid);
  const subscriptionKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", subscriptionKeys.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  let seen: Request | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    seen = new Request(input, init);
    return Promise.resolve(new Response(null, { status: 201 }));
  };
  try {
    const sender = getPushSender({
      PUSH_TRANSPORT: "webpush",
      VAPID_PUBLIC_KEY: JSON.stringify(exported.publicKey),
      VAPID_PRIVATE_KEY: JSON.stringify(exported.privateKey),
      VAPID_SUBJECT: "mailto:admin@example.test",
    });
    const result = await sender.send(
      {
        endpoint: "https://push.example.test/device",
        p256dh: bytesToBase64Url(raw),
        auth: bytesToBase64Url(auth),
      },
      JSON.stringify({ web_push: 8030 }),
      { ttl: 86400, urgency: "normal" },
    );
    assertEquals(result.status, 201);
  } finally {
    globalThis.fetch = original;
  }
  assert(seen);
  assertEquals(seen.headers.get("content-encoding"), "aes128gcm");
  assertEquals(seen.headers.get("ttl"), "86400");
  assertEquals(seen.headers.get("urgency"), "normal");
  const authorization = seen.headers.get("authorization") ?? "";
  assert(authorization.startsWith("vapid t="));
  assert(authorization.includes(", k="));
});
