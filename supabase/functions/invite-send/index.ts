import { withSupabase } from "@supabase/server";
import { sendEmail } from "../_shared/email.ts";
import { buildInviteEmail } from "../_shared/templates/invite.ts";

type IssueRow = {
  token: string;
  email: string;
  role: string;
  label: string;
  family_name: string;
  inviter_name: string;
  expires_at: string;
};

function appUrl(): string {
  const url = Deno.env.get("APP_URL");
  if (!url) {
    console.error("Missing APP_URL");
    throw new Error("Server misconfigured");
  }
  return url;
}

async function readJsonBody(request: Request): Promise<{ invitation_id?: string }> {
  try {
    return (await request.json()) as { invitation_id?: string };
  } catch {
    return {};
  }
}

export default {
  fetch: withSupabase({ auth: "user", cors: "disabled" }, async (request, ctx) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    try {
      const body = await readJsonBody(request);
      const invitationId = body.invitation_id;
      if (!invitationId) {
        return Response.json({ error: "invitation_id is required" }, { status: 400 });
      }

      const { data, error } = await ctx.supabase.rpc("issue_invitation_token", {
        p_invitation_id: invitationId,
      });

      if (error) {
        console.error("issue_invitation_token failed", invitationId, error.message);
        const status = error.code === "42501" || error.message.toLowerCase().includes("admin")
          ? 403
          : error.code === "22023"
          ? 429
          : 400;
        const message = error.code === "42501"
          ? "You do not have permission to send this invitation."
          : error.message;
        return Response.json({ error: message }, { status });
      }

      const row = (Array.isArray(data) ? data[0] : data) as IssueRow | undefined;
      if (!row?.token) {
        console.error("issue_invitation_token returned no token", invitationId);
        return Response.json({ error: "Could not prepare invitation." }, { status: 500 });
      }

      const admin = ctx.supabaseAdmin;
      const createResult = await admin.auth.admin.createUser({
        email: row.email,
        email_confirm: false,
        user_metadata: { display_name: row.label },
      });

      if (createResult.error) {
        const msg = createResult.error.message.toLowerCase();
        if (!msg.includes("already") && !msg.includes("registered")) {
          console.error("createUser failed", invitationId, createResult.error.message);
          return Response.json({ error: "Could not prepare sign-in for invitee." }, {
            status: 500,
          });
        }
      }

      const base = appUrl();
      const inviteUrl = `${base.replace(/\/$/, "")}/invite#${row.token}`;
      const mail = buildInviteEmail({
        familyName: row.family_name,
        inviterName: row.inviter_name,
        label: row.label,
        inviteUrl,
        expiresAt: new Date(row.expires_at),
      });

      await sendEmail({
        to: row.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });

      return Response.json({ ok: true });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unexpected error";
      if (message.includes("Too many emails")) {
        return Response.json({ error: message }, { status: 429 });
      }
      console.error("invite-send error", message);
      const url = Deno.env.get("SUPABASE_URL") ?? "";
      const localDev = url.includes("127.0.0.1") || url.includes("localhost") || url.includes("kong");
      return Response.json(
        { error: localDev ? message : "Could not send invitation." },
        { status: 500 },
      );
    }
  }),
};
