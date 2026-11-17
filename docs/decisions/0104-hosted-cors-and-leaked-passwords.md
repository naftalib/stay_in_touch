# Hosted API CORS and leaked-password protection

## Context
Handoff docs asked to restrict API allowed origins and to turn on leaked-password protection. Both were checked against Supabase's hosted gateway in November 2026.

## Options considered
- A dashboard allow-list of the app origin.
- Rely on the Edge Functions, which already reflect only `APP_URL`, plus RLS and bearer tokens.
- Pay for Pro to get leaked-password protection.

## Decision
The hosted API gateway allows every origin. That cannot be narrowed, so it is closed. Functions still reflect only `APP_URL`. Sessions are bearer tokens, not cookies. Leaked-password protection is a Pro feature and stays off on the free plan.

## Consequences
A foreign page cannot attach a user's token by itself. The checklist in `docs/hosted-settings.md` no longer asks Naftali to set an API origin list.

## Status
Accepted

## Date
2026-11-16
