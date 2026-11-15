import { createClient } from "@supabase/supabase-js";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { guardSecret, json } from "../_shared/http.ts";
import { getMediaStore } from "../_shared/media/index.ts";
import { handleMediaCleanup } from "./handler.ts";

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
      console.error("cleanup is missing Supabase configuration");
      return withCors(json({ error: "Server misconfigured." }, 500), request);
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const response = await handleMediaCleanup(request, {
      secret: Deno.env.get("MEDIA_CLEANUP_SECRET"),
      supabaseAdmin: admin,
      store: getMediaStore(),
    });
    const guarded = await guardSecret(response, key);
    return withCors(guarded, request);
  },
};
