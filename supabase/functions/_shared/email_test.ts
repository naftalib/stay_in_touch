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
      () => sendEmail({ to: "a@example.test", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
      Error,
      "Too many emails today",
    );
    globalThis.fetch = () => Promise.resolve(new Response("nope", { status: 401 }));
    await assertRejects(
      () => sendEmail({ to: "a@example.test", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
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
  const keys = ["EMAIL_TRANSPORT", "SUPABASE_URL", "EMAIL_FROM", "MAILPIT_URL"] as const;
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
      () => sendEmail({ to: "a@example.test", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }),
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
