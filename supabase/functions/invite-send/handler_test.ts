import { assertEquals, assertStringIncludes } from "@std/assert";
import { handleInviteSend, type InviteDeps } from "./handler.ts";

function ctx(overrides: {
  error?: { code?: string; message: string } | null;
  row?: Record<string, unknown> | null;
  createError?: { message: string } | null;
}): InviteDeps {
  return {
    supabase: {
      rpc: () =>
        Promise.resolve({
          data: overrides.row === undefined
            ? [{
              token: "super-secret-token-value",
              email: "aunt@example.test",
              role: "grandparent",
              label: "Aunt",
              family_name: "The Example Family",
              inviter_name: "Mom",
              expires_at: "2026-12-01T00:00:00.000Z",
            }]
            : overrides.row,
          error: overrides.error ?? null,
        }),
    },
    supabaseAdmin: {
      auth: {
        admin: {
          createUser: () => Promise.resolve({ error: overrides.createError ?? null }),
        },
      },
    },
  };
}

function post(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("http://kong:8000/functions/v1/invite-send", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://evil.example", ...headers },
    body: JSON.stringify(body),
  });
}

Deno.test("non-admin RPC error is a generic 403 and does not echo the token", async () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const res = await handleInviteSend(
      post({ invitation_id: "invite-1" }),
      ctx({ error: { code: "42501", message: "admin only token super-secret-token-value" } }),
    );
    const text = await res.text();
    assertEquals(res.status, 403);
    assertStringIncludes(text, "do not have permission");
    assertEquals(text.includes("super-secret-token-value"), false);
    assertEquals(logs.join("\n").includes("super-secret-token-value"), false);
  } finally {
    console.error = original;
  }
});

Deno.test("the response never contains the token and the link ignores Origin", async () => {
  Deno.env.set("APP_URL", "http://127.0.0.1:5173");
  let sent = "";
  const res = await handleInviteSend(
    post({ invitation_id: "invite-1" }),
    ctx({}),
    (input) => {
      sent = `${input.html}\n${input.text}`;
      return Promise.resolve();
    },
  );
  const text = await res.text();
  assertEquals(res.status, 200);
  assertEquals(text, '{"ok":true}');
  assertEquals(text.includes("super-secret-token-value"), false);
  assertStringIncludes(sent, "http://127.0.0.1:5173/invite#super-secret-token-value");
  assertEquals(sent.includes("evil.example"), false);
});

Deno.test("rate-limit SQL errors are returned to the admin", async () => {
  const res = await handleInviteSend(
    post({ invitation_id: "invite-1" }),
    ctx({ error: { code: "22023", message: "please wait a minute before sending again" } }),
  );
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error, "please wait a minute before sending again");
});
