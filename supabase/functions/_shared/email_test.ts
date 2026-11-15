import { assertRejects } from "@std/assert";
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
