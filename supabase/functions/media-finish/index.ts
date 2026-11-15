import { withSupabase } from "@supabase/server";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { guardSecret } from "../_shared/http.ts";
import { getMediaStore } from "../_shared/media/index.ts";
import { handleMediaFinish } from "./handler.ts";

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
  const provider = Deno.env.get("MEDIA_PROVIDER")?.trim();
  if (!provider) {
    console.error("MEDIA_PROVIDER is missing");
    return new Response(JSON.stringify({ error: "Something went wrong." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  return await handleMediaFinish(request, {
    loadMedia: async (id) => {
      const loaded = await ctx.supabase.from("media").select(
        "id, status, r2_key, thumb_key, expected_bytes, expected_thumb_bytes",
      ).eq("id", id).maybeSingle();
      return { data: loaded.data, error: loaded.error };
    },
    markReady: async (args) => {
      const result = await ctx.supabaseAdmin.rpc("mark_media_ready", args);
      return { error: result.error };
    },
    markFailed: async (args) => {
      const result = await ctx.supabaseAdmin.rpc("mark_media_failed", args);
      return { error: result.error };
    },
    store: getMediaStore(),
    provider,
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
