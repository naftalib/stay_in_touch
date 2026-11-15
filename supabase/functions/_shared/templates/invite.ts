import { escapeHtml } from "../escape.ts";

export type InviteTemplateInput = {
  familyName: string;
  inviterName: string;
  label: string;
  inviteUrl: string;
  expiresAt: Date;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildInviteEmail(input: InviteTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const family = escapeHtml(input.familyName);
  const inviter = escapeHtml(input.inviterName);
  const label = escapeHtml(input.label);
  const url = escapeHtml(input.inviteUrl);
  const until = escapeHtml(formatDate(input.expiresAt));

  const subject = `${input.inviterName} invited you to ${input.familyName} on Stay In Touch`
    .replace(/[\r\n]+/g, " ");

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,sans-serif;font-size:18px;line-height:1.5;color:#111;padding:24px;max-width:32rem;">
  <p style="font-size:20px;"><strong>${inviter}</strong> invited you to join <strong>${family}</strong> on Stay In Touch as ${label}.</p>
  <p style="margin:32px 0;">
    <a href="${url}" style="display:inline-block;background:#1a5cff;color:#fff;text-decoration:none;font-size:20px;padding:16px 28px;border-radius:12px;">Join ${family}</a>
  </p>
  <p style="word-break:break-all;font-size:16px;">${url}</p>
  <p style="font-size:16px;color:#444;">This invitation works until ${until}.</p>
  <p style="font-size:16px;color:#444;">If you weren't expecting this, you can ignore it.</p>
</body>
</html>`;

  const text =
    `${input.inviterName} invited you to join ${input.familyName} on Stay In Touch as ${input.label}.

Join: ${url}

This invitation works until ${until}.

If you weren't expecting this, you can ignore it.`;

  return { subject, html, text };
}
