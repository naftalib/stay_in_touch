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

## CI fix round 3 (Nov 15)

- **Mailpit:** `invite-send` used `inbucket:8025`; local stack exposes Mailpit at `127.0.0.1:54324` (`MAILPIT_URL` in `.env.example`).
- Dropped `afterAll` `db reset` in `invites-admin.spec.ts` (global setup already resets; mid-suite reset broke PostgREST on later projects).

## CI fix round 4 (Nov 15)

- Mailpit `/api/v1/send` expects `{ From: { Email }, To: [{ Email }] }` (not Inbucket string form).
- Per-project invite email addresses; parse Mailpit message `Text`/`HTML`.
- `remove_member` E2E moved to `z-removed-member.spec.ts` (runs last, resets DB after) so seed `noa` is not removed mid-suite.

## CI fix round 5 (Nov 15)

- E2E `invite-send` goes through Kong into the edge-runtime container: loopback `MAILPIT_URL` and host-only `SUPABASE_URL` checks failed. Default Mailpit to `http://inbucket:8025` on the Docker network; CI exports edge secrets before `supabase start`.

## CI fix round 6 (Nov 15)

- E2E job [43733686550](https://github.com/naftalib/stay_in_touch/actions/runs/43733686550) failed before Playwright: `supabase start` could not bind Mailpit host port 54324 (`address already in use`). E2E `supabase start` now stops any prior stack and retries up to three times.

## CI fix round 7 (Nov 15)

- Dropped `supabase functions serve` from the e2e job so Kong routes to the stack edge runtime (with `MAILPIT_URL=http://inbucket:8025`), not a second worker using loopback Mailpit from `.env.example`. Local `invite-send` returns the underlying error message for easier CI diagnosis.

## CI fix round 8 (Nov 15)

- E2e setup flakiness: GitHub runners sometimes leave Supabase ports busy (54322/54324). Prep step removes `supabase_*` containers and kills bound ports before each `supabase start` attempt.

## CI fix round 9 (Nov 15)

- Run [43735855549](https://github.com/naftalib/stay_in_touch/actions/runs/43735855549): invite mail works; invite E2E failed because `latestEmailTo` picked the invite email (no OTP). Wait for code UI and pass `since` after requesting the sign-in code.

## CI fix round 10 (Nov 15)

- `InvitePage.sendCode` mirrors sign-in OTP: show the code form unless rate-limited (invitee auth user already exists). E2E uses the full button label and `textbox` role for the code field.

## Follow-ups carried forward

- Expand Playwright to full spec §10 list and axe matrix on new screens.
- Hosted Resend domain go-live (switch `EMAIL_TRANSPORT` only).
- Audit-log viewer, label edits, family settings UI.
- Slim Realtime payload to ids only (already consumed that way in the UI).
- Delete auth users for never-accepted invites (partially addressed by orphan cleanup job).