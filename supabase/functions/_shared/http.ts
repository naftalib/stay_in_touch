export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Drop a response that accidentally includes the service role key. */
export async function guardSecret(
  response: Response,
  secret: string | undefined,
): Promise<Response> {
  if (!secret) return response;
  const text = await response.text();
  if (!text.includes(secret)) {
    return new Response(text, { status: response.status, headers: response.headers });
  }
  console.error("refusing to return a response that contained the service key");
  return json({ error: "Something went wrong." }, 500);
}

export type RpcError = { code?: string; message: string } | null;

export function rpcFailure(error: { code?: string; message: string }): Response {
  if (error.code === "42501") {
    return json({ error: "You can't add a photo here." }, 403);
  }
  if (error.code === "22023") {
    return json({ error: error.message }, 400);
  }
  console.error("rpc failed", error.code ?? "unknown");
  return json({ error: "Something went wrong." }, 500);
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
