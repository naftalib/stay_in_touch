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

See **Review and fixes** below. The builder could not run Docker, so pgTAP, Deno, and Playwright had not actually run before review.

## Review and fixes

Reviewed on 15 Nov 2026 against the handoff spec and the review checklist. Fixes are on `cursor/invites-and-admin-7986`.

### Security

- Invite tokens stay 32 random bytes, stored as SHA-256, single-use for accept, and rotated on resend. `token_hash` is not granted to `authenticated` or `anon`.
- Accept compares emails with `private.normalized_email()` (trim and case). The role always comes from the invitation. A non-admin, another family's admin, a grandparent, and a child cannot issue tokens.
- Revoke keeps the hash and sets `status = 'revoked'`, so the old link says the invitation was cancelled and accept still fails. Clearing the hash made every cancelled link look like a random guess.
- Orphan cleanup still refuses users who have signed in, have a session, have any family membership, or have another pending invite.
- Removed-member Realtime: after `remove_member`, `refreshSession()`, and `realtime.setAuth()`, a new General post was **not** delivered within 5 seconds, and REST returned no rows. The web client also drops and rejoins channels when the access token changes.
- `invite-send` builds the link from `APP_URL` only, redacts long token-like strings from logs, and never returns the token.

### What was broken before it could run

- `private.finish_accept_invitation` used `%rowtype` in a parameter list. Postgres rejects that. The parameter is `public.invitations`.
- `authenticated` has no UPDATE on `invitations`, which is correct. pgTAP that set `last_sent_at` now does it as the table owner.
- Anon may execute only `invitation_preview`. The catalog test allows that one function.
- Mailpit's send API expects `From` and `To` as `{ Name, Email }` objects. A display-name string returned HTTP 400, so no invite mail left the function.
- `auth.admin.createUser({ email_confirm: false })` plus `enable_signup = false` makes `signInWithOtp` return `signup_disabled`. Invite-created users are now created with `email_confirm: true`. Signup stays closed. The OTP still proves the person has the inbox. See ADR 0060.
- Local CLI 3.1.0 `supabase functions serve --env-file supabase/functions/.env.example` injects those variables into the edge-runtime container. `SUPABASE_URL` there is `http://kong:8000`. Mailpit is reachable at `http://inbucket:8025` from that container (published on the host as port 54324). The host cannot resolve the name `inbucket`.

### Product gaps closed in review

- Accessible confirm dialogs replace `window.confirm` for revoke, remove, role change, archive, and unarchive.
- Wrong-account "Continue as …" returns to `/invite` after sign-out instead of dumping the person on the sign-in page.
- A removed member who reloads a family they had opened sees "You no longer have access to this family."
- Playwright covers the spec §10 journeys, including Mailpit invite accept, the child alias password, the second-family banner, and the Realtime removal probe. axe runs on the invite, members, confirm, and spaces screens in light, dark, and extra-large text.
- Child password screen asks for 8 characters. Local Auth `minimum_password_length` stays 6.
- WebKit and iPhone were painting unstyled buttons with system colors (white on `#c0c0c0`). Buttons now set their own background, text color, and `appearance: none`.
- On a phone, sign-out no longer clicks the Spaces button while the drawer is already open (that button is inert behind the modal).
- Member and invite helper text uses `--color-text-muted`. `--color-muted` is not a token, so those lines were inheriting the body color.

### Tests run locally

- pgTAP: 22 files, 376 tests, pass.
- Deno: 11 tests, pass (`deno fmt`, `deno lint`, `deno check`, `deno test --allow-env`).
- Web: oxlint, `tsc`, Vitest 22 tests, pass.
- Playwright: 120 passed in 6.5 minutes on Chromium, WebKit, and iPhone 13 (local `pnpm dev`, Mailpit on port 54324), including `z-removed-member.spec.ts`. The invite file resets the database when it finishes so later files still see the seed.

## Deviations from the plan and why

- **Local stack:** The builder's environment had no Docker, so the full stack was not run before the first push. Review ran `supabase start`, `supabase functions serve`, pgTAP, Deno, and Playwright locally.
- **E2E breadth:** The first push covered the core invite and admin gates. Review added the spec §10 journeys (resend and cancel, expiry, child alias, second family, Realtime after removal, axe on the new screens).
- **Gmail SMTP:** Transport stub exists in `sendEmail()`; hosted prototype wiring is documented; CI uses Mailpit only.

## Open questions and decisions made

- **`email_confirm`:** `false` does not work with public signup disabled. OTP to an unconfirmed invite user is rejected as `signup_disabled`. Invite-created users are created with `email_confirm: true` (ADR 0060). The code form opens only after GoTrue accepts the send. A send error stays on the invite preview.
- **Realtime after removal:** After `remove_member`, `refreshSession()`, and `realtime.setAuth()`, the next General post was not delivered and REST returned no rows. The client also rejoins channels when the access token changes (ADR 0056). Playwright covers this.
- **CLI 3.1.0 function env:** The stack edge runtime reads `MAILPIT_URL`. From that container Mailpit is `http://inbucket:8025`. The host inbox is `http://127.0.0.1:54324`. `.env.example` keeps the host URL for a host-side `functions serve`.
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

## Review rebase (Nov 15)

Rebased the review onto the CI fix rounds above. Invite users are created already confirmed (ADR 0060). Revoke keeps the token hash and sets `status = 'revoked'`. A loopback `MAILPIT_URL` is ignored when the function is running on the Docker network, so host `.env.example` does not point the edge runtime at itself. Playwright after this rebase: 120 passed in 6.5 minutes. The invite file still resets the database when it finishes so later specs see the seed. `z-removed-member.spec.ts` remains as a last-file REST check.

## CI fix round 11 (Nov 15)

- Run [43740864806](https://github.com/naftalib/stay_in_touch/actions/runs/43740864806) on review commit `c172b2f`: web ~20s, functions ~11s, db ~85s; e2e failed on mobile only (`child alias sets a password and can switch back`) — drawer footer “Switch account” was not actionable. Added `switchAccountFromApp` and flex shrink on the Spaces drawer body.
- Run [43742532230](https://github.com/naftalib/stay_in_touch/actions/runs/43742532230) on `307eb2d` failed the same iPhone test. The helper returned before the shell had painted, so the drawer never opened, and `spacesShell` matched every dialog. It now waits for the aside nav or the Spaces button, then scopes the shell to the aside or the Spaces drawer. The drawer and the side column keep the footer on screen while the space list scrolls.
- Run [43744303310](https://github.com/naftalib/stay_in_touch/actions/runs/43744303310) on `f6375e0`: webkit child-alias failed after Lia password sign-in — session restored but `SignInPage` kept `?signedOut=1` and blocked redirect. Password and OTP success now `navigate` to the safe return path.
- Run [43745321458](https://github.com/naftalib/stay_in_touch/actions/runs/43745321458) on `66523b7` (**all green**): web ~20s, functions ~11s, db ~74s, e2e ~463s / 120 tests (chromium, webkit, mobile).

## Follow-ups carried forward

- Hosted Resend domain go-live (switch `EMAIL_TRANSPORT` only). No Resend key is in the repo or CI.
- Turn on hosted Auth email confirmation and set JWT expiry to 600 seconds (documented in `docs/hosted-settings.md`). Local confirmation stays off and local JWT expiry stays 3600 seconds.
- Gmail SMTP is implemented and unit-tested, and has not been sent through a real Gmail account.
- Audit-log viewer, label edits, and family settings UI.
- Slim Realtime payload to ids only (the UI already reads it that way).
- Leaked-password protection on the child password screen is a paid Supabase feature and is not enabled locally.
- Orphan cleanup does not delete auth users who still have a pending invite. That is intentional.