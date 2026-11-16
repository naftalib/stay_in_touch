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

export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const pad = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
