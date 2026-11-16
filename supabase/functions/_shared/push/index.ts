import { captureSender } from "./capture.ts";
import type { PushSender } from "./types.ts";
import { webPushSender } from "./webpush.ts";

export type { PushPayload, PushSender, PushSendOptions, PushSubscriptionKeys } from "./types.ts";
export { buildPushPayload, notificationBody, publicAppUrl } from "./payload.ts";

export function getPushSender(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): PushSender {
  const transport = env.PUSH_TRANSPORT?.trim() ?? "";
  if (!transport) {
    console.error("PUSH_TRANSPORT is missing");
    throw new Error("PUSH_TRANSPORT is missing");
  }
  if (transport === "capture") return captureSender();
  if (transport === "webpush") return webPushSender(env);
  console.error("Unknown PUSH_TRANSPORT");
  throw new Error(`Unknown PUSH_TRANSPORT: ${transport}`);
}
