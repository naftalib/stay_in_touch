import {
  ApplicationServer,
  type ExportedVapidKeys,
  importVapidKeys,
  PushMessageError,
  Urgency,
} from "@negrel/webpush";
import type { PushSender } from "./types.ts";

export function readVapidJwk(value: string): JsonWebKey {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as JsonWebKey;
  const bytes = Uint8Array.from(
    atob(trimmed.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as JsonWebKey;
}

export function assertVapidEnv(env: Record<string, string | undefined>): void {
  for (const key of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const) {
    if (!env[key]?.trim()) throw new Error(`${key} is missing`);
  }
}

export function webPushSender(env: Record<string, string | undefined>): PushSender {
  assertVapidEnv(env);
  let server: ApplicationServer | null = null;

  return {
    async send(sub, payload, opts) {
      if (!server) {
        const exported: ExportedVapidKeys = {
          publicKey: readVapidJwk(env.VAPID_PUBLIC_KEY ?? ""),
          privateKey: readVapidJwk(env.VAPID_PRIVATE_KEY ?? ""),
        };
        const vapidKeys = await importVapidKeys(exported);
        server = await ApplicationServer.new({
          contactInformation: env.VAPID_SUBJECT ?? "",
          vapidKeys,
        });
      }
      const subscriber = server.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      });
      try {
        const encoded = new TextEncoder().encode(payload);
        const body = encoded.buffer.slice(
          encoded.byteOffset,
          encoded.byteOffset + encoded.byteLength,
        );
        await subscriber.pushMessage(body, {
          ttl: opts.ttl,
          urgency: Urgency.Normal,
        });
        return { status: 201 };
      } catch (caught) {
        if (caught instanceof PushMessageError) {
          return { status: caught.response.status };
        }
        throw caught;
      }
    },
  };
}
