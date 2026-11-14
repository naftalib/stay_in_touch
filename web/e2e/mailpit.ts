const MAILPIT = "http://127.0.0.1:54324";

type MailAddress = { Address?: string; address?: string };

type MailSummary = {
  ID: string;
  Created?: string;
  To?: MailAddress[];
  Snippet?: string;
};

type MailMessage = MailSummary & {
  HTML?: string;
  Text?: string;
};

async function listMessages(): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=50`);
  if (!res.ok) throw new Error(`Mailpit error ${res.status}`);
  const data = (await res.json()) as { messages?: MailSummary[] };
  return data.messages ?? [];
}

function addressedTo(message: MailSummary, email: string): boolean {
  return (message.To ?? []).some((entry) => {
    const value = (entry.Address ?? entry.address ?? "").toLowerCase();
    return value === email.toLowerCase();
  });
}

export async function latestEmailTo(
  email: string,
  since = new Date(0),
): Promise<MailMessage | null> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const messages = await listMessages();
    const match = messages.find((message) => {
      if (!addressedTo(message, email)) return false;
      if (!message.Created) return true;
      return new Date(message.Created).getTime() >= since.getTime() - 2000;
    });
    if (match) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
      if (!full.ok) throw new Error(`Mailpit message error ${full.status}`);
      return (await full.json()) as MailMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return null;
}

export function extractOtp(text: string): string | null {
  const match = text.match(/\b(\d{6})\b/);
  return match?.[1] ?? null;
}

export function extractMagicLink(html: string): string | null {
  const decoded = html.replaceAll("&amp;", "&");
  const hrefs = [...decoded.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  return (
    hrefs.find((href) => href.includes("type=magiclink") || href.includes("/auth/v1/verify")) ??
    null
  );
}
