/** Rewrite a Storage URL so the browser never sees the Docker network host. */
export function rewritePublicUrl(url: string, publicBase: string): string {
  const base = new URL(publicBase);
  const parsed = new URL(url);
  parsed.protocol = base.protocol;
  parsed.host = base.host;
  return parsed.toString();
}

export function expiresAtFromToken(url: string, fallbackSeconds: number, now = Date.now()): string {
  const token = new URL(url).searchParams.get("token");
  if (token) {
    const payload = token.split(".")[1];
    if (payload) {
      try {
        const json = JSON.parse(
          atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
        ) as { exp?: number };
        if (typeof json.exp === "number") {
          return new Date(json.exp * 1000).toISOString();
        }
      } catch {
        // Not a JWT. Fall through to the requested lifetime.
      }
    }
  }
  return new Date(now + fallbackSeconds * 1000).toISOString();
}

/** Headers the browser must send on a raw signed PUT. Content-Length is forbidden to set from script. */
export function jpegPutHeaders(): Record<string, string> {
  return {
    "content-type": "image/jpeg",
    "cache-control": "max-age=31536000",
    "x-upsert": "false",
  };
}
