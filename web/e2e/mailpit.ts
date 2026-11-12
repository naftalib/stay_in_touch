const MAILPIT = 'http://127.0.0.1:54324'

type MailpitMessage = {
  ID: string
  Subject: string
  Text: string
  HTML: string
}

export async function latestEmailTo(
  email: string,
): Promise<MailpitMessage | null> {
  const res = await fetch(`${MAILPIT}/api/v1/messages?limit=50`)
  if (!res.ok) throw new Error(`Mailpit error ${res.status}`)
  const data = (await res.json()) as { messages?: MailpitMessage[] }
  const messages = data.messages ?? []
  return (
    messages.find(
      (m) => m.Text.includes(email) || m.HTML.includes(email),
    ) ?? messages[0] ?? null
  )
}

export function extractOtp(text: string): string | null {
  const match = text.match(/\b(\d{6})\b/)
  return match?.[1] ?? null
}

export function extractMagicLink(html: string): string | null {
  const match = html.match(/href="([^"]+type=signup[^"]+|[^"]+token_hash[^"]+)"/i)
  if (match) return match[1]
  const href = html.match(/href="(http[^"]+)"/)
  return href?.[1] ?? null
}
