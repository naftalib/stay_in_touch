import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildInviteUrl } from "../inviteLink.ts";
import { buildInviteEmail } from "./invite.ts";

Deno.test("invite template escapes HTML in names", () => {
  const mail = buildInviteEmail({
    familyName: "Test <script>",
    inviterName: "Mom",
    label: "<img src=x onerror=alert(1)>",
    inviteUrl: "http://127.0.0.1:5173/invite#abc",
    expiresAt: new Date("2026-12-01T12:00:00Z"),
  });
  assertStringIncludes(mail.html, "&lt;img");
  assertStringIncludes(mail.text, "<img src=x onerror=alert(1)>");
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
Deno.test("invite template escapes a breakout in the link and the family name", () => {
  const mail = buildInviteEmail({
    familyName: '"><a href=https://evil.example>',
    inviterName: "Mom",
    label: "Aunt",
    inviteUrl: 'http://127.0.0.1:5173/invite#tok"en',
    expiresAt: new Date("2026-12-01T12:00:00Z"),
  });
  assertEquals(mail.html.includes('"><a href=https://evil.example>'), false);
  assertStringIncludes(mail.html, "&quot;&gt;&lt;a href=https://evil.example&gt;");
  assertStringIncludes(mail.html, "tok&quot;en");
  assertEquals(buildInviteUrl("http://127.0.0.1:5173", "abc"), "http://127.0.0.1:5173/invite#abc");
});
