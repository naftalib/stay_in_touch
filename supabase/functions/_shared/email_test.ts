import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { sendEmail } from "./email.ts";

Deno.test("sendEmail rejects missing transport", async () => {
  const prev = Deno.env.get("EMAIL_TRANSPORT");
  Deno.env.delete("EMAIL_TRANSPORT");
  try {
    await assertRejects(
      () =>
        sendEmail({
          to: "a@example.test",
          subject: "Hi",
          html: "<p>Hi</p>",
          text: "Hi",
        }),
      Error,
      "EMAIL_TRANSPORT",
    );
  } finally {
    if (prev) Deno.env.set("EMAIL_TRANSPORT", prev);
  }
});

Deno.test("mailpit transport refused for non-local Supabase URL", async () => {
  const keys = ["EMAIL_TRANSPORT", "SUPABASE_URL", "EMAIL_FROM"] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = Deno.env.get(k);
  try {
    Deno.env.set("EMAIL_TRANSPORT", "mailpit");
    Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
    Deno.env.set("EMAIL_FROM", "Stay In Touch <no-reply@example.test>");
    await assertRejects(
      () =>
        sendEmail({
          to: "a@example.test",
          subject: "Hi",
          html: "<p>Hi</p>",
          text: "Hi",
        }),
      Error,
      "local",
    );
  } finally {
    for (const k of keys) {
      const v = saved[k];
      if (v) Deno.env.set(k, v);
      else Deno.env.delete(k);
    }
  }
});
Deno.test("resend 429 and 401 become admin-facing errors", async () => {
  const original = globalThis.fetch;
  const saved = {
    transport: Deno.env.get("EMAIL_TRANSPORT"),
    key: Deno.env.get("RESEND_API_KEY"),
    from: Deno.env.get("EMAIL_FROM"),
  };
  Deno.env.set("EMAIL_TRANSPORT", "resend");
  Deno.env.set("RESEND_API_KEY", "test-key");
  Deno.env.set("EMAIL_FROM", "Stay In Touch <no-reply@example.test>");
  try {
    globalThis.fetch = () => Promise.resolve(new Response("quota", { status: 429 }));
    await assertRejects(
      () =>
        sendEmail({
          to: "a@example.test",
          subject: "Hi",
          html: "<p>Hi</p>",
          text: "Hi",
        }),
      Error,
      "Too many emails today",
    );
    globalThis.fetch = () => Promise.resolve(new Response("nope", { status: 401 }));
    await assertRejects(
      () =>
        sendEmail({
          to: "a@example.test",
          subject: "Hi",
          html: "<p>Hi</p>",
          text: "Hi",
        }),
      Error,
      "rejected the request",
    );
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(saved)) {
      const name = key === "transport"
        ? "EMAIL_TRANSPORT"
        : key === "key"
        ? "RESEND_API_KEY"
        : "EMAIL_FROM";
      if (value) Deno.env.set(name, value);
      else Deno.env.delete(name);
    }
  }
});

Deno.test("mailpit is allowed for the Docker kong hostname", async () => {
  const original = globalThis.fetch;
  const keys = [
    "EMAIL_TRANSPORT",
    "SUPABASE_URL",
    "EMAIL_FROM",
    "MAILPIT_URL",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) saved[key] = Deno.env.get(key);
  let called = "";
  let calledUrl = "";
  globalThis.fetch = (input, init) => {
    calledUrl = String(input);
    called = String(init?.body ?? "");
    return Promise.resolve(new Response("ok", { status: 200 }));
  };
  try {
    Deno.env.set("EMAIL_TRANSPORT", "mailpit");
    Deno.env.set("SUPABASE_URL", "http://kong:8000");
    Deno.env.set("EMAIL_FROM", "Stay In Touch <no-reply@example.test>");
    Deno.env.set("MAILPIT_URL", "http://inbucket:8025");
    await sendEmail({
      to: "a@example.test",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    assertStringIncludes(called, "a@example.test");
    assertEquals(calledUrl, "http://inbucket:8025/api/v1/send");
    Deno.env.set("MAILPIT_URL", "http://127.0.0.1:54324");
    await sendEmail({
      to: "a@example.test",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    });
    assertEquals(calledUrl, "http://inbucket:8025/api/v1/send");
  } finally {
    globalThis.fetch = original;
    for (const key of keys) {
      const value = saved[key];
      if (value) Deno.env.set(key, value);
      else Deno.env.delete(key);
    }
  }
});

Deno.test("gmail transport speaks SMTP to a local fake server", async () => {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  let sawPass = false;
  const conversation = (async () => {
    const conn = await listener.accept();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";
    const write = (line: string) => conn.write(encoder.encode(`${line}\r\n`));
    const readLine = async (): Promise<string> => {
      while (!buffer.includes("\r\n")) {
        const chunk = new Uint8Array(4096);
        const n = await conn.read(chunk);
        if (n === null) throw new Error("closed");
        buffer += decoder.decode(chunk.subarray(0, n));
      }
      const idx = buffer.indexOf("\r\n");
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      return line;
    };
    await write("220 localhost ESMTP");
    const ehlo = await readLine();
    if (!ehlo.startsWith("EHLO")) throw new Error("expected EHLO");
    await write("250 AUTH LOGIN");
    if ((await readLine()) !== "AUTH LOGIN") throw new Error("expected AUTH");
    await write("334 VXNlcm5hbWU6");
    await readLine();
    await write("334 UGFzc3dvcmQ6");
    const pass = atob(await readLine());
    sawPass = pass === "local-app-password";
    await write("235 ok");
    await readLine();
    await write("250 ok");
    await readLine();
    await write("250 ok");
    if ((await readLine()) !== "DATA") throw new Error("expected DATA");
    await write("354 go");
    while (true) {
      const line = await readLine();
      if (line === ".") break;
    }
    await write("250 queued");
    await readLine();
    conn.close();
  })();

  const keys = [
    "EMAIL_TRANSPORT",
    "GMAIL_SMTP_HOST",
    "GMAIL_SMTP_PORT",
    "GMAIL_SMTP_TLS",
    "GMAIL_SMTP_USER",
    "GMAIL_SMTP_PASS",
    "EMAIL_FROM",
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) saved[key] = Deno.env.get(key);
  Deno.env.set("EMAIL_TRANSPORT", "gmail");
  Deno.env.set("GMAIL_SMTP_HOST", "127.0.0.1");
  Deno.env.set("GMAIL_SMTP_PORT", String(port));
  Deno.env.set("GMAIL_SMTP_TLS", "off");
  Deno.env.set("GMAIL_SMTP_USER", "sender@example.test");
  Deno.env.set("GMAIL_SMTP_PASS", "local-app-password");
  Deno.env.set("EMAIL_FROM", "Stay In Touch <sender@example.test>");
  try {
    await sendEmail({
      to: "parent@example.test",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
    });
    await conversation;
    assertEquals(sawPass, true);
  } finally {
    listener.close();
    for (const key of keys) {
      const value = saved[key];
      if (value) Deno.env.set(key, value);
      else Deno.env.delete(key);
    }
  }
});

Deno.test("gmail transport refuses header injection and missing credentials", async () => {
  const saved = {
    transport: Deno.env.get("EMAIL_TRANSPORT"),
    user: Deno.env.get("GMAIL_SMTP_USER"),
    pass: Deno.env.get("GMAIL_SMTP_PASS"),
    from: Deno.env.get("EMAIL_FROM"),
  };
  try {
    Deno.env.set("EMAIL_TRANSPORT", "gmail");
    Deno.env.delete("GMAIL_SMTP_USER");
    Deno.env.delete("GMAIL_SMTP_PASS");
    await assertRejects(
      () =>
        sendEmail({
          to: "a@example.test",
          subject: "Hi",
          html: "<p>Hi</p>",
          text: "Hi",
        }),
      Error,
      "GMAIL_SMTP_USER",
    );
    Deno.env.set("GMAIL_SMTP_USER", "person@gmail.com");
    Deno.env.set("GMAIL_SMTP_PASS", "app-password");
    Deno.env.set("EMAIL_FROM", "Stay In Touch <person@gmail.com>");
    await assertRejects(
      () =>
        sendEmail({
          to: "a@example.test\r\nBcc: evil@example.test",
          subject: "Hi",
          html: "<p>Hi</p>",
          text: "Hi",
        }),
      Error,
      "Invalid email",
    );
  } finally {
    const mapping: Record<string, string | undefined> = {
      EMAIL_TRANSPORT: saved.transport,
      GMAIL_SMTP_USER: saved.user,
      GMAIL_SMTP_PASS: saved.pass,
      EMAIL_FROM: saved.from,
    };
    for (const [key, value] of Object.entries(mapping)) {
      if (value) Deno.env.set(key, value);
      else Deno.env.delete(key);
    }
  }
});
