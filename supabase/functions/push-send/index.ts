import { createClient } from "@supabase/supabase-js";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { guardSecret, json } from "../_shared/http.ts";
import { getPushSender } from "../_shared/push/index.ts";
import { createPushAdmin } from "./admin.ts";
import { handlePushSend } from "./handler.ts";

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  fetch: async (request: Request): Promise<Response> => {
    const options = handleOptions(request);
    if (options) return options;
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.error("push-send is missing Supabase configuration");
      return withCors(json({ error: "Server misconfigured." }, 500), request);
    }
    let sender;
    try {
      sender = getPushSender();
    } catch (caught) {
      console.error(caught instanceof Error ? caught.message : "push sender is not configured");
      return withCors(json({ error: "Server misconfigured." }, 500), request);
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const response = await handlePushSend(request, {
      secret: Deno.env.get("PUSH_SEND_SECRET"),
      appUrl: Deno.env.get("APP_URL"),
      admin: createPushAdmin(admin),
      sender,
    });
    const guarded = await guardSecret(response, key);
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const pushSecret = Deno.env.get("PUSH_SEND_SECRET");
    const withoutPrivate = await guardSecret(guarded, privateKey);
    const safe = await guardSecret(withoutPrivate, pushSecret);
    return withCors(safe, request);
  },
};
