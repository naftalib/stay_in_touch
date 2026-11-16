export const NOTIFICATION_ICON = "/pwa-192.png";
export const NOTIFICATION_BADGE = "/badge-96.png";

export type PushNotice = {
  title: string;
  body: string;
  tag: string;
  url: string | null;
  appBadge: number | null;
};

/** Same-origin target from an Apple Declarative Web Push payload. */
export function notificationTarget(data: unknown, origin: string): string | null {
  if (!data || typeof data !== "object") return null;
  const notification = (data as { notification?: { navigate?: unknown } }).notification;
  const navigate = notification?.navigate;
  if (typeof navigate !== "string" || navigate.length === 0) return null;
  try {
    const url = new URL(navigate, origin);
    if (url.origin !== origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Title, body, tag, click URL, and badge count. A bad payload stays generic. */
export function pushNotice(data: unknown, origin: string): PushNotice {
  const notice: PushNotice = {
    title: "Stay In Touch",
    body: "New activity in Stay In Touch",
    tag: "stay-in-touch",
    url: null,
    appBadge: null,
  };
  if (!data || typeof data !== "object") return notice;
  const notification =
    (data as { notification?: { title?: unknown; body?: unknown; tag?: unknown } })
      .notification;
  if (typeof notification?.title === "string" && notification.title.length > 0) {
    notice.title = notification.title;
  }
  if (typeof notification?.body === "string" && notification.body.length > 0) {
    notice.body = notification.body;
  }
  if (typeof notification?.tag === "string" && notification.tag.length > 0) {
    notice.tag = notification.tag;
  }
  notice.url = notificationTarget(data, origin);
  const badge = (data as { app_badge?: unknown }).app_badge;
  if (typeof badge === "number" && Number.isFinite(badge) && badge >= 0) {
    notice.appBadge = Math.min(Math.floor(badge), 99_999);
  }
  return notice;
}

export function applicationServerKeysMatch(
  existing: ArrayBuffer | ArrayBufferView | null,
  configured: string,
): boolean {
  if (!existing || configured.length === 0) return false;
  const current = existing instanceof ArrayBuffer
    ? new Uint8Array(existing)
    : new Uint8Array(existing.buffer, existing.byteOffset, existing.byteLength);
  const next = urlBase64ToBytes(configured);
  if (current.byteLength !== next.byteLength) return false;
  for (let i = 0; i < current.byteLength; i += 1) {
    if (current[i] !== next[i]) return false;
  }
  return true;
}

type BadgeControls = {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function applyWorkerBadge(
  count: number | null,
  nav: BadgeControls | undefined,
): Promise<void> {
  if (count === null || !nav) return;
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // A broken Badge API must not drop the notification that was just shown.
  }
}

export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const pad = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
