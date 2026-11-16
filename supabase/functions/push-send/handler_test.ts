import { assert, assertEquals } from "@std/assert";
import type { PushSender } from "../_shared/push/types.ts";
import { type FactRow, handlePushSend, type PushAdmin, type SubscriptionRow } from "./handler.ts";

const MARKER = "zz-secret-body-marker-zz";
const ENDPOINT = "https://push.example.test/device-endpoint";
const P256 = "p256dh-secret-value";
const AUTH = "auth-secret-value";
const PRIVATE = "vapid-private-test";

function fact(overrides: Partial<FactRow> = {}): FactRow {
  return {
    id: "row-1",
    recipient_user_id: "user-noa",
    recipient_member_id: "member-noa",
    family_id: "family",
    space_id: "space-noa",
    space_title: "Noa's space",
    actor_label: "Grandma",
    created_at: "2026-11-16T10:00:00.000Z",
    attempts: 1,
    eligible: true,
    skip_reason: null,
    app_badge: 2,
    ...overrides,
  };
}

function admin(options: {
  facts?: FactRow[];
  subs?: SubscriptionRow[];
  delivered?: string[];
}): { admin: PushAdmin; recorded: unknown[]; deleted: string[]; logs: string[] } {
  const recorded: unknown[] = [];
  const deleted: string[] = [];
  const logs: string[] = [];
  const delivered = options.delivered ?? [];
  const facts = options.facts ?? [fact()];
  const subs = options.subs ?? [
    {
      id: "sub-1",
      endpoint: ENDPOINT,
      p256dh: P256,
      auth: AUTH,
      failure_count: 0,
    },
  ];
  return {
    recorded,
    deleted,
    logs,
    admin: {
      claim: () => Promise.resolve(facts.map((row) => row.id)),
      facts: () => Promise.resolve(facts),
      subscriptions: () => Promise.resolve(subs),
      record: (input) => {
        recorded.push(input);
        return Promise.resolve();
      },
      deleteSubscription: (id) => {
        deleted.push(id);
        return Promise.resolve();
      },
      markUsed: () => Promise.resolve(),
      noteFailure: () => Promise.resolve(),
      delivered: () => Promise.resolve([...delivered]),
      noteDelivered: (_ids, subscriptionId) => {
        delivered.push(subscriptionId);
        return Promise.resolve();
      },
      prune: () => Promise.resolve(),
    },
  };
}

function sender(statuses: number[]): PushSender {
  let index = 0;
  return {
    send: () => {
      const status = statuses[index] ?? 201;
      index += 1;
      return Promise.resolve({ status });
    },
  };
}

function request(secret: string | null, body: unknown = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret) headers.set("x-push-send-secret", secret);
  return new Request("http://127.0.0.1/push-send", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test("push-send rejects a missing secret", async () => {
  const harness = admin({});
  const response = await handlePushSend(request(null), {
    secret: "local-push-dev",
    appUrl: "http://127.0.0.1:5173",
    admin: harness.admin,
    sender: sender([201]),
    log: (message) => harness.logs.push(message),
  });
  assertEquals(response.status, 401);
  const text = await response.text();
  assertEquals(text.includes(PRIVATE), false);
  assertEquals(text.includes(ENDPOINT), false);
});

Deno.test("push-send sends who and where and drops a dead subscription", async () => {
  const harness = admin({});
  const response = await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "http://127.0.0.1:5173",
    admin: harness.admin,
    sender: sender([410]),
    log: (message) => harness.logs.push(message),
  });
  assertEquals(response.status, 200);
  assertEquals(harness.deleted, ["sub-1"]);
  const recorded = harness.recorded[0] as { status: string; skipReason: string };
  assertEquals(recorded.status, "skipped");
  assertEquals(recorded.skipReason, "no_device");
  const blob = JSON.stringify({ response: await response.text(), logs: harness.logs, recorded });
  assertEquals(blob.includes(ENDPOINT), false);
  assertEquals(blob.includes(P256), false);
  assertEquals(blob.includes(AUTH), false);
  assertEquals(blob.includes(PRIVATE), false);
  assertEquals(blob.includes(MARKER), false);
});

Deno.test("404 deletes the subscription", async () => {
  const harness = admin({});
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "http://127.0.0.1:5173",
    admin: harness.admin,
    sender: sender([404]),
    log: () => {},
  });
  assertEquals(harness.deleted, ["sub-1"]);
});

Deno.test("429 schedules a retry", async () => {
  const harness = admin({});
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "http://127.0.0.1:5173",
    admin: harness.admin,
    sender: sender([429]),
    log: () => {},
  });
  const recorded = harness.recorded[0] as { status: string; retry: boolean; lastStatus: number };
  assertEquals(recorded.status, "pending");
  assertEquals(recorded.retry, true);
  assertEquals(recorded.lastStatus, 429);
});

Deno.test("a server error schedules a retry", async () => {
  const harness = admin({});
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "http://127.0.0.1:5173",
    admin: harness.admin,
    sender: sender([503]),
    log: () => {},
  });
  const recorded = harness.recorded[0] as { retry: boolean };
  assertEquals(recorded.retry, true);
});

Deno.test("a pause after enqueue skips the send", async () => {
  let called = false;
  const harness = admin({
    facts: [fact({ eligible: false, skip_reason: "paused" })],
  });
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "http://127.0.0.1:5173",
    admin: harness.admin,
    sender: {
      send: () => {
        called = true;
        return Promise.resolve({ status: 201 });
      },
    },
    log: () => {},
  });
  assertEquals(called, false);
  const recorded = harness.recorded[0] as { status: string; skipReason: string };
  assertEquals(recorded.status, "skipped");
  assertEquals(recorded.skipReason, "paused");
});

Deno.test("navigate refuses the in-network origin", async () => {
  const harness = admin({});
  await handlePushSend(request("local-push-dev", { note: MARKER }), {
    secret: "local-push-dev",
    appUrl: "http://kong:8000",
    admin: harness.admin,
    sender: sender([201]),
    log: () => {},
  });
  const recorded = harness.recorded[0] as { status: string; sentPayload: unknown };
  assertEquals(recorded.status, "failed");
  assertEquals(recorded.sentPayload, null);
  assertEquals(JSON.stringify(recorded).includes("kong:8000"), false);
  assertEquals(JSON.stringify(recorded).includes(MARKER), false);
});

Deno.test("two authors become one who-and-where payload", async () => {
  const harness = admin({
    facts: [
      fact({ id: "a", actor_label: "Grandma", created_at: "2026-11-16T10:00:00.000Z" }),
      fact({ id: "b", actor_label: "Dad", created_at: "2026-11-16T10:05:00.000Z" }),
    ],
  });
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "https://stay.example.test",
    admin: harness.admin,
    sender: sender([201]),
    log: () => {},
  });
  const recorded = harness.recorded[0] as {
    status: string;
    sentPayload: {
      notification: { body: string; navigate: string; tag: string };
      app_badge: number;
    };
  };
  assertEquals(recorded.status, "sent");
  assertEquals(recorded.sentPayload.notification.body, "Grandma and Dad posted in Noa's space");
  assertEquals(
    recorded.sentPayload.notification.navigate,
    "https://stay.example.test/f/family/s/space-noa/messages",
  );
  assertEquals(recorded.sentPayload.notification.tag, "space:space-noa");
  assertEquals(recorded.sentPayload.app_badge, 2);
  assert(!JSON.stringify(recorded.sentPayload).includes(MARKER));
});

Deno.test("one device's success still retries the device that failed", async () => {
  const phone = "https://push.example.test/phone";
  const tablet = "https://push.example.test/tablet";
  const delivered: string[] = [];
  const calls: string[] = [];
  const harness = admin({
    subs: [
      { id: "phone", endpoint: phone, p256dh: P256, auth: AUTH, failure_count: 0 },
      { id: "tablet", endpoint: tablet, p256dh: P256, auth: AUTH, failure_count: 0 },
    ],
    delivered,
  });
  const deps = {
    secret: "local-push-dev",
    appUrl: "https://stay.example.test",
    admin: harness.admin,
    log: () => {},
  };
  await handlePushSend(request("local-push-dev"), {
    ...deps,
    sender: {
      send: (sub) => {
        calls.push(sub.endpoint);
        return Promise.resolve({ status: sub.endpoint === phone ? 201 : 503 });
      },
    },
  });
  const first = harness.recorded[0] as { status: string; retry: boolean };
  assertEquals(first.status, "pending");
  assertEquals(first.retry, true);
  assertEquals(delivered, ["phone"]);
  assertEquals(calls, [phone, tablet]);

  calls.length = 0;
  await handlePushSend(request("local-push-dev"), {
    ...deps,
    sender: {
      send: (sub) => {
        calls.push(sub.endpoint);
        return Promise.resolve({ status: 201 });
      },
    },
  });
  const second = harness.recorded[1] as { status: string; retry: boolean };
  assertEquals(calls, [tablet]);
  assertEquals(second.status, "sent");
  assertEquals(second.retry, false);
});

Deno.test("each skipped row keeps its own reason", async () => {
  const harness = admin({
    facts: [
      fact({ id: "paused-row", eligible: false, skip_reason: "paused" }),
      fact({
        id: "deleted-row",
        eligible: false,
        skip_reason: "deleted",
        created_at: "2026-11-16T10:05:00.000Z",
      }),
    ],
  });
  let called = false;
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "https://stay.example.test",
    admin: harness.admin,
    sender: {
      send: () => {
        called = true;
        return Promise.resolve({ status: 201 });
      },
    },
    log: () => {},
  });
  assertEquals(called, false);
  const reasons = harness.recorded.map((row) => (row as { skipReason: string }).skipReason).sort();
  assertEquals(reasons, ["deleted", "paused"]);
});

Deno.test("three posts use the count", async () => {
  const harness = admin({
    facts: [
      fact({ id: "a", created_at: "2026-11-16T10:00:00.000Z" }),
      fact({ id: "b", actor_label: "Dad", created_at: "2026-11-16T10:01:00.000Z" }),
      fact({ id: "c", actor_label: "Mom", created_at: "2026-11-16T10:02:00.000Z" }),
    ],
  });
  await handlePushSend(request("local-push-dev"), {
    secret: "local-push-dev",
    appUrl: "https://stay.example.test",
    admin: harness.admin,
    sender: sender([201]),
    log: () => {},
  });
  const recorded = harness.recorded[0] as { sentPayload: { notification: { body: string } } };
  assertEquals(recorded.sentPayload.notification.body, "3 new posts in Noa's space");
});
