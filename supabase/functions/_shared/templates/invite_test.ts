import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { buildInviteEmail } from "./invite.ts";

Deno.test("invite template escapes HTML in names", () => {
  const mail = buildInviteEmail({
    familyName: 'Test <script>',
    inviterName: "Mom",
    label: '<img src=x onerror=alert(1)>',
    inviteUrl: "http://127.0.0.1:5173/invite#abc",
    expiresAt: new Date("2026-12-01T12:00:00Z"),
  });
  assertStringIncludes(mail.html, "&lt;img");
  assertStringIncludes(mail.text, '<img src=x onerror=alert(1)>');
  assertStringIncludes(mail.subject, "Mom invited you");
});

Deno.test("invite template uses APP link shape", () => {
  const mail = buildInviteEmail({
    familyName: "Family",
    inviterName: "Mom",
    label: "Aunt",
    inviteUrl: "http://127.0.0.1:5173/invite#token123",
    expiresAt: new Date("2026-12-01T12:00:00Z"),
  });
  assertStringIncludes(mail.html, "http://127.0.0.1:5173/invite#token123");
  assertEquals(mail.text.includes("token123"), true);
});