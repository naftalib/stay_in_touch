function appOrigin(): string {
  const url = Deno.env.get("APP_URL");
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = appOrigin();
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin && allowed && origin === allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
