# Resend SMTP and Web Push

## Context
Invites and notifications must reach real family inboxes. iOS requires install-to-home-screen for push.

## Options considered
- Supabase built-in email only.
- Resend as custom SMTP for Supabase Auth; Web Push with VAPID.

## Decision
Resend for Auth email. Web Push for notifications. Supabase built-in email is insufficient (~2 team addresses per hour).

## Consequences
Hosted checklist in [`docs/hosted-settings.md`](../hosted-settings.md). Push and email are not implemented in code yet.

## Status
Accepted

## Date
2026-11-12
