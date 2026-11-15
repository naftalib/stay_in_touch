const MAILPIT = "http://127.0.0.1:54324";

type MailAddress = { Address?: string; address?: string };

type MailSummary = {
  ID: string;
  Created?: string;
  To?: MailAddress[];
  Snippet?: string;
};

export type MailMessage = MailSummary & {
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
  accept?: (message: MailMessage) => boolean,
): Promise<MailMessage | null> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const messages = await listMessages();
    const candidates = messages
      .filter((message) => {
        if (!addressedTo(message, email)) return false;
        if (!message.Created) return true;
        return new Date(message.Created).getTime() >= since.getTime() - 2000;
      })
      .sort((a, b) => {
        const left = a.Created ? new Date(a.Created).getTime() : 0;
        const right = b.Created ? new Date(b.Created).getTime() : 0;
        return right - left;
      });
    for (const match of candidates) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
      if (!full.ok) throw new Error(`Mailpit message error ${full.status}`);
      const message = (await full.json()) as MailMessage;
      if (!accept || accept(message)) return message;
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
