import { withSupabase } from "@supabase/server";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { handleInviteSend } from "./handler.ts";

function withCors(response: Response, request: Request): Response {
  const headers = new Headers(response.headers);
  const extra = corsHeaders(request);
  for (const [key, value] of Object.entries(extra)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const authed = withSupabase({ auth: "user", cors: "disabled" }, async (request, ctx) => {
  return await handleInviteSend(request, {
    supabase: {
      rpc: (fn, args) => ctx.supabase.rpc(fn, args),
    },
    supabaseAdmin: ctx.supabaseAdmin,
  });
});

export default {
  fetch: async (request: Request): Promise<Response> => {
    const options = handleOptions(request);
    if (options) return options;
    const response = await authed(request);
    return withCors(response, request);
  },
};
