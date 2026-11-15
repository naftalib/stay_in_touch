import { withSupabase } from "@supabase/server";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { guardSecret } from "../_shared/http.ts";
import { getMediaStore } from "../_shared/media/index.ts";
import { handleMediaUploadUrl } from "./handler.ts";

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

const authed = withSupabase({ auth: "user", cors: "disabled" }, async (request, ctx) => {
  return await handleMediaUploadUrl(request, {
    supabase: {
      rpc: (fn, args) => ctx.supabase.rpc(fn, args),
    },
    store: getMediaStore(),
  });
});

export default {
  fetch: async (request: Request): Promise<Response> => {
    const options = handleOptions(request);
    if (options) return options;
    const response = await authed(request);
    const guarded = await guardSecret(response, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    return withCors(guarded, request);
  },
};
