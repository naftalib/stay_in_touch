import { buildPushPayload } from "../_shared/push/payload.ts";
import type { PushSender } from "../_shared/push/types.ts";
import { json, readJson } from "../_shared/http.ts";

export type FactRow = {
  id: string;
  recipient_user_id: string;
  recipient_member_id: string;
  family_id: string;
  space_id: string;
  space_title: string;
  actor_label: string;
  created_at: string;
  attempts: number;
  eligible: boolean;
  skip_reason: string | null;
  app_badge: number;
};

export type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failure_count: number;
};

export type PushAdmin = {
  claim: (limit: number) => Promise<string[]>;
  facts: (ids: string[]) => Promise<FactRow[]>;
  subscriptions: (userId: string) => Promise<SubscriptionRow[]>;
  record: (input: {
    ids: string[];
    status: "pending" | "sent" | "skipped" | "failed";
    lastStatus: number | null;
    skipReason: string | null;
    sentPayload: unknown;
    retry: boolean;
  }) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  markUsed: (id: string) => Promise<void>;
  noteFailure: (id: string, failureCount: number) => Promise<void>;
  prune: () => Promise<void>;
};

export type PushSendDeps = {
  secret: string | undefined;
  appUrl: string | undefined;
  admin: PushAdmin;
  sender: PushSender;
  log?: (message: string) => void;
};

export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const encoded = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoded.encode(provided)),
    crypto.subtle.digest("SHA-256", encoded.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function groupsOf(facts: FactRow[]): FactRow[][] {
  const ordered = [...facts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const groups = new Map<string, FactRow[]>();
  for (const fact of ordered) {
    const key = `${fact.recipient_member_id}:${fact.space_id}`;
    const list = groups.get(key) ?? [];
    list.push(fact);
    groups.set(key, list);
  }
  return [...groups.values()];
}

export async function handlePushSend(request: Request, deps: PushSendDeps): Promise<Response> {
  const log = deps.log ?? ((message) => console.error(message));
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!deps.secret) {
    log("PUSH_SEND_SECRET is missing");
    return json({ error: "Server misconfigured." }, 500);
  }
  const provided = request.headers.get("x-push-send-secret") ?? "";
  if (!provided || !(await secretsMatch(provided, deps.secret))) {
    return json({ error: "Unauthorized." }, 401);
  }

  const body = await readJson(request);
  const sweep = Boolean(
    body && typeof body === "object" && (body as { sweep?: unknown }).sweep === true,
  );
  if (sweep) await deps.admin.prune();

  const ids = await deps.admin.claim(50);
  if (ids.length === 0) {
    return json({ claimed: 0, sent: 0, skipped: 0, failed: 0, retried: 0 });
  }
  const facts = await deps.admin.facts(ids);
  const counts = { claimed: ids.length, sent: 0, skipped: 0, failed: 0, retried: 0 };

  for (const group of groupsOf(facts)) {
    const ineligible = group.filter((fact) => !fact.eligible);
    if (ineligible.length > 0) {
      await deps.admin.record({
        ids: ineligible.map((fact) => fact.id),
        status: "skipped",
        lastStatus: null,
        skipReason: ineligible[0]?.skip_reason ?? "skipped",
        sentPayload: null,
        retry: false,
      });
      counts.skipped += ineligible.length;
    }
    const eligible = group.filter((fact) => fact.eligible);
    if (eligible.length === 0) continue;

    const first = eligible[0];
    if (!first) continue;
    const authors: string[] = [];
    for (const fact of eligible) {
      if (!authors.includes(fact.actor_label)) authors.push(fact.actor_label);
    }
    let payload;
    try {
      payload = buildPushPayload({
        authors,
        postCount: eligible.length,
        spaceTitle: first.space_title,
        familyId: first.family_id,
        spaceId: first.space_id,
        appUrl: deps.appUrl ?? "",
        appBadge: first.app_badge,
      });
    } catch (caught) {
      log(caught instanceof Error ? caught.name : "payload");
      await deps.admin.record({
        ids: eligible.map((fact) => fact.id),
        status: "failed",
        lastStatus: null,
        skipReason: "config",
        sentPayload: null,
        retry: false,
      });
      counts.failed += eligible.length;
      continue;
    }
    const payloadText = JSON.stringify(payload);
    const subs = await deps.admin.subscriptions(first.recipient_user_id);
    if (subs.length === 0) {
      await deps.admin.record({
        ids: eligible.map((fact) => fact.id),
        status: "skipped",
        lastStatus: null,
        skipReason: "no_device",
        sentPayload: null,
        retry: false,
      });
      counts.skipped += eligible.length;
      continue;
    }

    let success = false;
    let retry = false;
    let hardFail = false;
    let gone = 0;
    let lastStatus: number | null = null;
    for (const sub of subs) {
      let status = 503;
      try {
        const result = await deps.sender.send(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payloadText,
          { ttl: 86_400, urgency: "normal" },
        );
        status = result.status;
      } catch (caught) {
        log(`subscription ${sub.id} status 503`);
        log(caught instanceof Error ? caught.name : "error");
        status = 503;
      }
      log(`subscription ${sub.id} status ${status}`);
      if (status === 201 || status === 202) {
        success = true;
        lastStatus = status;
        await deps.admin.markUsed(sub.id);
      } else if (status === 404 || status === 410) {
        gone += 1;
        await deps.admin.deleteSubscription(sub.id);
      } else if (status === 429 || status >= 500) {
        retry = true;
        lastStatus = status;
        await deps.admin.noteFailure(sub.id, sub.failure_count + 1);
      } else {
        hardFail = true;
        lastStatus = status;
      }
    }

    if (success) {
      await deps.admin.record({
        ids: eligible.map((fact) => fact.id),
        status: "sent",
        lastStatus,
        skipReason: null,
        sentPayload: payload,
        retry: false,
      });
      counts.sent += eligible.length;
    } else if (retry) {
      await deps.admin.record({
        ids: eligible.map((fact) => fact.id),
        status: "pending",
        lastStatus,
        skipReason: null,
        sentPayload: null,
        retry: true,
      });
      counts.retried += eligible.length;
    } else if (gone === subs.length) {
      await deps.admin.record({
        ids: eligible.map((fact) => fact.id),
        status: "skipped",
        lastStatus,
        skipReason: "no_device",
        sentPayload: null,
        retry: false,
      });
      counts.skipped += eligible.length;
    } else if (hardFail) {
      await deps.admin.record({
        ids: eligible.map((fact) => fact.id),
        status: "failed",
        lastStatus,
        skipReason: null,
        sentPayload: null,
        retry: false,
      });
      counts.failed += eligible.length;
    }
  }

  return json(counts);
}
