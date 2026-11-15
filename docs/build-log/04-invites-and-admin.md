# Invites, invite email and basic admin tools

**Date:** 2026-11-15

## Goal

Handoff 04: invite tokens and email, `/invite` accept flow, child passwords and recent-account switching, admin Members and Spaces pages, orphan auth cleanup, pgTAP / Deno / Playwright coverage, CI with Edge Runtime and Deno.

## Models

- **Builder:** Composer 2.5
- **Reviewer:** Grok 4.7

## PR

https://github.com/naftalib/stay_in_touch/pull/4

## What was built

- Migration `20261115160000_invite_tokens_and_admin.sql`: token hash columns, `issue_invitation_token`, `invitation_preview`, `accept_invitation`, `my_pending_invitations`, `remove_member` archives owned space, `private.cleanup_orphan_invite_auth_users` + pg_cron schedule when available.
- Edge Function `invite-send` with shared Mailpit / Resend / Gmail SMTP transports, plain HTML invite template, `@supabase/server` user auth.
- Web: `/invite`, pending-invitation UI, Members and Spaces admin routes, recent accounts on sign-in, Realtime token-refresh channel reset.
- Tests: `98_invite_tokens.sql`, Deno tests under `supabase/functions`, `web/e2e/invites-admin.spec.ts`.
- CI: Edge Runtime enabled in e2e, `functions` job (Deno fmt/lint/check/test), functions served with `.env.example`.

## Review findings and how each was resolved

Pending Grok 4.7 review.

## Deviations from the plan and why

- **Local stack:** This build environment has no Docker, so the full stack was not run locally before push; validation is via CI (max three fix rounds if needed).
- **E2E breadth:** Playwright covers core invite and admin gates; not every scenario in spec §10 is automated yet (resend/revoke chains, full axe matrix, child-alias journey).
- **Gmail SMTP:** Transport stub exists in `sendEmail()`; hosted prototype wiring is documented; CI uses Mailpit only.

## Open questions and decisions made

- **`email_confirm: false` on `auth.admin.createUser`:** Used for invite-created users; E2E relies on OTP + `verifyOtp` to confirm (see ADR 0048).
- **Realtime after removal:** Client unsubscribes all channels on `TOKEN_REFRESHED`; dedicated Realtime drop test still TODO in Playwright (see ADR 0056).
- **CI job durations (run [43729437566](https://github.com/naftalib/stay_in_touch/actions/runs/43729437566) on `02f00e7`, after pgTAP/types fixes):** web ~24s, functions ~10s, db ~77s; e2e failed on Playwright (invite helper double-read of `fetch` body; one webkit sign-in flake).

## CI fix round 2 (Nov 15)

- Revoked `EXECUTE` on new `private.*` invite helpers from `anon`/`authenticated`; catalog test `93` exempts `invitation_preview` for anon.
- pgTAP `98`: rate-limit setup via `reset role`; `plan(12)` matches assertions.
- Regenerated-shape `database.types.ts` (column order + RPC signatures).
- E2E: read each `fetch` response body once in `invites-admin.spec.ts`; widened sign-in redirect timeout in fixtures.

## Follow-ups carried forward

- Expand Playwright to full spec §10 list and axe matrix on new screens.
- Hosted Resend domain go-live (switch `EMAIL_TRANSPORT` only).
- Audit-log viewer, label edits, family settings UI.
- Slim Realtime payload to ids only (already consumed that way in the UI).
- Delete auth users for never-accepted invites (partially addressed by orphan cleanup job).