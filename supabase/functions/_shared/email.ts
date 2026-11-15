export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Missing required env: ${name}`);
    throw new Error(`Email is not configured (${name})`);
  }
  return value;
}

function supabaseUrl(): string {
  return Deno.env.get("SUPABASE_URL") ?? "";
}

function isLocalSupabaseUrl(): boolean {
  const raw = supabaseUrl();
  if (!raw) return true;
  let host = "";
  let protocol = "";
  try {
    const url = new URL(raw);
    host = url.hostname.toLowerCase();
    protocol = url.protocol;
  } catch {
    return false;
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "kong" ||
    host === "host.docker.internal" ||
    host.includes("supabase_kong")
  ) {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  // Docker DNS names on the local stack are single labels over http.
  return protocol === "http:" && !host.includes(".");
}

function insideDockerNetwork(): boolean {
  const url = supabaseUrl();
  return !url || url.includes("kong") || url.includes("supabase_kong");
}

function mailpitBaseUrl(): string {
  const configured = Deno.env.get("MAILPIT_URL")?.replace(/\/$/, "");
  const loopback = configured ? /127\.0\.0\.1|localhost|\[::1\]/.test(configured) : false;
  // `.env.example` uses the host port. That address is the container itself
  // once the function runs on the Supabase Docker network.
  if (configured && !(insideDockerNetwork() && loopback)) return configured;
  if (insideDockerNetwork()) return "http://inbucket:8025";
  return "http://127.0.0.1:54324";
}

function parseMailbox(raw: string): { Name: string; Email: string } {
  const match = raw.match(/^(.*)<([^>]+)>\s*$/);
  if (!match) return { Name: "", Email: raw.trim() };
  return {
    Name: match[1].trim().replaceAll(/^["']|["']$/g, ""),
    Email: match[2].trim(),
  };
}

function smtpSafe(value: string, label: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`Invalid email ${label}`);
  }
  return value;
}

async function sendViaMailpit(input: SendEmailInput): Promise<void> {
  if (!isLocalSupabaseUrl()) {
    throw new Error("Mailpit transport is only allowed for local Supabase");
  }
  const from = parseMailbox(
    Deno.env.get("EMAIL_FROM") ?? "Stay In Touch <no-reply@example.test>",
  );
  const body = {
    From: from,
    To: [{ Email: input.to, Name: "" }],
    Subject: input.subject,
    HTML: input.html,
    Text: input.text,
  };
  const res = await fetch(`${mailpitBaseUrl()}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Mailpit send failed", res.status, text);
    throw new Error("Could not send email");
  }
}

async function sendViaResend(input: SendEmailInput): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("EMAIL_FROM");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  if (res.status === 429) {
    throw new Error("Too many emails today. Try again tomorrow.");
  }
  if (res.status === 401) {
    console.error("Resend rejected the API key");
    throw new Error("Email service rejected the request. Check the sending setup.");
  }
  if (res.status === 422) {
    console.error("Resend could not deliver", await res.text());
    throw new Error("The invitation email could not be delivered. Check the address.");
  }
  if (!res.ok) {
    console.error("Resend send failed", res.status, await res.text());
    throw new Error("Could not send email");
  }
}

async function sendViaGmail(input: SendEmailInput): Promise<void> {
  const host = smtpSafe(Deno.env.get("GMAIL_SMTP_HOST") ?? "smtp.gmail.com", "host");
  const port = Number(Deno.env.get("GMAIL_SMTP_PORT") ?? "465");
  const user = smtpSafe(requireEnv("GMAIL_SMTP_USER"), "user");
  const pass = requireEnv("GMAIL_SMTP_PASS");
  const from = smtpSafe(requireEnv("EMAIL_FROM"), "from");
  const to = smtpSafe(input.to, "to");
  const subject = smtpSafe(input.subject, "subject");

  const conn = await Deno.connectTls({ hostname: host, port });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  const readLine = async (): Promise<string> => {
    while (!buffer.includes("\r\n")) {
      const chunk = new Uint8Array(4096);
      const n = await conn.read(chunk);
      if (n === null) throw new Error("SMTP connection closed");
      buffer += decoder.decode(chunk.subarray(0, n));
    }
    const idx = buffer.indexOf("\r\n");
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    return line;
  };

  const write = (line: string) => conn.write(encoder.encode(`${line}\r\n`));

  const expect = async (code: number) => {
    const line = await readLine();
    const got = Number(line.slice(0, 3));
    if (got !== code) throw new Error(`SMTP expected ${code}, got ${line}`);
  };

  await readLine();
  await write(`EHLO stay-in-touch`);
  while (true) {
    const line = await readLine();
    if (line.startsWith("250 ")) break;
    if (!line.startsWith("250-")) break;
  }
  await write("AUTH LOGIN");
  await expect(334);
  await write(btoa(user));
  await expect(334);
  await write(btoa(pass));
  await expect(235);
  await write(`MAIL FROM:<${user}>`);
  await expect(250);
  await write(`RCPT TO:<${to}>`);
  await expect(250);
  await write("DATA");
  await expect(354);
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="sit"',
    "",
    "--sit",
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.text,
    "",
    "--sit",
    "Content-Type: text/html; charset=utf-8",
    "",
    input.html,
    "",
    "--sit--",
    ".",
  ].join("\r\n");
  await write(mime);
  await expect(250);
  await write("QUIT");
  conn.close();
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const transport = requireEnv("EMAIL_TRANSPORT");
  switch (transport) {
    case "mailpit":
      await sendViaMailpit(input);
      return;
    case "resend":
      await sendViaResend(input);
      return;
    case "gmail":
      await sendViaGmail(input);
      return;
    default:
      console.error("Unknown EMAIL_TRANSPORT", transport);
      throw new Error("Email is not configured");
  }
}
