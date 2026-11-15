import { sendEmail, type SendEmailInput } from "../_shared/email.ts";
import { buildInviteEmail } from "../_shared/templates/invite.ts";
import { buildInviteUrl } from "../_shared/inviteLink.ts";

export type IssueRow = {
  token: string;
  email: string;
  role: string;
  label: string;
  family_name: string;
  inviter_name: string;
  expires_at: string;
};

type RpcError = { code?: string; message: string } | null;

export type InviteDeps = {
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: RpcError }>;
  };
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: (args: {
          email: string;
          email_confirm: boolean;
          user_metadata: { display_name: string };
        }) => PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
};

function appUrl(): string {
  const url = Deno.env.get("APP_URL");
  if (!url) {
    console.error("Missing APP_URL");
    throw new Error("Server misconfigured");
  }
  return url;
}

function redact(message: string, secret: string | undefined): string {
  const next = secret ? message.split(secret).join("[redacted]") : message;
  return next.replace(/[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

function logSafe(message: string, secret: string | undefined): void {
  console.error(redact(message, secret));
}

function jsonResponse(body: unknown, status: number, secret?: string): Response {
  let text = JSON.stringify(body);
  if (secret && text.includes(secret)) {
    text = JSON.stringify({ error: "Could not send invitation." });
    status = 500;
  }
  return new Response(text, {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function readJsonBody(request: Request): Promise<{ invitation_id?: string }> {
  try {
    return (await request.json()) as { invitation_id?: string };
  } catch {
    return {};
  }
}

export async function handleInviteSend(
  request: Request,
  ctx: InviteDeps,
  deliver: (input: SendEmailInput) => Promise<void> = sendEmail,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let token: string | undefined;
  try {
    const body = await readJsonBody(request);
    const invitationId = body.invitation_id;
    if (!invitationId || typeof invitationId !== "string") {
      return jsonResponse({ error: "invitation_id is required" }, 400);
    }

    const { data, error } = await ctx.supabase.rpc("issue_invitation_token", {
      p_invitation_id: invitationId,
    });

    if (error) {
      logSafe(`issue_invitation_token failed ${invitationId} ${error.message}`, token);
      const status = error.code === "42501" ? 403 : error.code === "22023" ? 429 : 400;
      const message = error.code === "42501"
        ? "You do not have permission to send this invitation."
        : error.code === "22023"
        ? error.message
        : "Could not prepare invitation.";
      return jsonResponse({ error: message }, status);
    }

    const row = (Array.isArray(data) ? data[0] : data) as IssueRow | undefined;
    if (!row?.token || !row.email) {
      logSafe(`issue_invitation_token returned no token ${invitationId}`, token);
      return jsonResponse({ error: "Could not prepare invitation." }, 500);
    }
    token = row.token;

    const createResult = await ctx.supabaseAdmin.auth.admin.createUser({
      email: row.email,
      email_confirm: true,
      user_metadata: { display_name: row.label },
    });

    if (createResult.error) {
      const msg = createResult.error.message.toLowerCase();
      if (!msg.includes("already") && !msg.includes("registered") && !msg.includes("exists")) {
        logSafe(`createUser failed ${invitationId} ${createResult.error.message}`, token);
        return jsonResponse({ error: "Could not prepare sign-in for invitee." }, 500);
      }
    }

    const inviteUrl = buildInviteUrl(appUrl(), row.token);
    const mail = buildInviteEmail({
      familyName: row.family_name,
      inviterName: row.inviter_name,
      label: row.label,
      inviteUrl,
      expiresAt: new Date(row.expires_at),
    });

    await deliver({
      to: row.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });

    return jsonResponse({ ok: true }, 200, token);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unexpected error";
    logSafe(`invite-send error ${message}`, token);
    if (
      message.includes("Too many emails") ||
      message.includes("Email service rejected") ||
      message.includes("could not be delivered")
    ) {
      return jsonResponse({ error: message }, message.includes("Too many emails") ? 429 : 502);
    }
    return jsonResponse({ error: "Could not send invitation." }, 500, token);
  }
}
