# Bootstrap confirms the user, and test can start over

**Date:** 2026-11-22

## Goal

Handoff 10: `bootstrap:family` created an unconfirmed auth user, so the hosted invite page got HTTP 422 `signup_disabled` when it requested a sign-in code. Confirm that user the same way invite-send does, repair an existing unconfirmed user on a re-run, and give the test project a safe way to delete the unjoined "Test Family" that was sent to `you+test@gmail.com`.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** Grok 4.7

## PR

https://github.com/naftalib/stay_in_touch/pull/10

## What was built

- `findOrCreateUser` creates the auth user with `email_confirm: true`. If the address already exists and is unconfirmed, `updateUserById` confirms it only after `bootstrap_family` succeeds. A user this command just created is deleted if that RPC fails. The same family name and email still reuse one family.
- `--reset --confirm-reset` is test-only. Production is refused before the env file is read. `public.reset_unjoined_bootstrap_family` deletes one unjoined bootstrap family, its General space, its pending invite, its audit rows, and that invite's auth user. It locks the auth user before it reads sign-in state. A family with a member, content, a sign-in, or any other row is left in place. A second reset is a no-op.
- The runbook's test invite address is `<your-gmail>+mom@gmail.com`. Plus-addresses of `breuningapp@gmail.com` are the inbox that works. The current test project has PowerShell commands to reset `you+test@gmail.com` and bootstrap again.
- Ops CI runs bootstrap against local Auth with signup off and confirmations on, then `signInWithOtp` with `create_user: false`. An unconfirmed user gets 422 `signup_disabled`. After bootstrap, Mailpit receives the code. Reset's production refusal and the member refusal run in the same job. pgTAP covers the delete bounds.

## Review findings and how each was resolved

- **Fixed.** `private.reset_unjoined_bootstrap_family` read `last_sign_in_at` and `auth.sessions` without locking `auth.users`. A sign-in could commit after those reads and still be deleted, because the later checks only look at app rows and `auth.users` cascades to sessions. pgTAP runs in one transaction, so nothing interleaved a sign-in, and no test asserted `for update`. The follow-up migration locks the auth user before the sign-in read and holds that lock through the delete. The delete itself matches only a user with `last_sign_in_at` null and no session. The invite and space rows are locked the same way, then re-read before the family delete. pgTAP now requires those locks in the function body, and a session row blocks reset while `last_sign_in_at` is null.
- **Fixed.** `findOrCreateUser` confirmed an existing user, and created a new confirmed user, before `bootstrap_family`. A re-run that the RPC refuses (`family name already exists`) left a stranger confirmed, or left a brand-new confirmed user who can request a sign-in code and whom orphan cleanup will not remove. The hosted proof only bootstrapped emails whose family create succeeded, and the Deno test only checked that `updateUserById` appeared in the file. Confirmation now runs after the RPC succeeds. A user created by this command is deleted when the RPC fails. The hosted-auth proof re-runs the same family (still one family), refuses an unrelated unconfirmed address without confirming it, and expects no auth row for an email it created and then refused.
- **Fixed.** The ops job never ran the hosted sign-in proof. `scripts/deploy/hosted-refusal_test.sh` rejects `ops-suite.sh` if the source names the production env file, and the new reset check grepped for that name. The guards step failed, so the suite, including `bootstrap-hosted-otp.sh`, was skipped. The check now looks for a file-read error without naming that file. The proof stays the last step of the suite, which the ops job runs.

## Deviations from the plan and why

- Reset is a flag on `bootstrap:family`, not a second script. The production refusal lives in the argument parser so it runs before any file read.
- The alternative was to change the pending invite's email. That would have left the stranger's auth user in the test project and made a different email able to take the family name. Reset is the option that matches "start over". ADR 0112.
- The hosted-auth proof patches local `enable_confirmations` and the local email rate for one process start, then restores `supabase/config.toml`. The committed local config stays confirmations-off (ADR 0103). The ops job does not restart Auth a second time on GitHub Actions; the runner is discarded. A local run of the script restarts again so the stack matches the file.
- Right after Auth starts, Kong can refuse the magic-link template and GoTrue caches that failure for about 10 seconds. The proof waits until Kong serves the template and Auth logs a later reload. Otherwise Mailpit gets the built-in letter, which has no 6-digit code.
- The browser bootstrap test no longer writes `email_confirmed_at` itself. Bootstrap confirms the user.

## Open questions and decisions made

- Why reset instead of rewriting the invite email: the hosted row points at an inbox Naftali does not read. ADR 0112.
- The database function cannot see which hosted project it is on. The CLI refuses `--env production` before it reads `.env.production.local` and before it calls the function.

## Follow-ups carried forward

- Naftali still has to run the PowerShell reset and bootstrap against the hosted test project. This handoff does not call that project.
- Items still open from build log 09 are unchanged, including the test-project deploy re-run and the phone checks.

## Follow-up

- **Fixed.** `private.reset_unjoined_bootstrap_family` locked the family row and then the invite. `bootstrap_family` and `accept_invitation` locked the invite and then inserted a row that needs the family (`audit_log`, or `family_members` inside `finish_accept_invitation`). Each side could wait for the other's lock. The same order was in `accept_invite`, `revoke_invitation`, and `issue_invitation_token`. pgTAP runs each call in one transaction, so the two orders never overlapped, and no test compared them. Reset keeps family-then-invite. The other five functions now take the family row before the invitation. `117_family_before_invite.sql` requires that order in the function bodies. It also holds the family row in a second session, starts `bootstrap_family`, and locks the invitation while that call waits. That lock is the one the old order deadlocks on.
- **Fixed.** The family-first `accept_invitation` looked the invite up by `token_hash`, waited for the family lock, then loaded the row again by id. A resend could rotate the hash in that gap and the old link still joined. Accept tests run in one transaction, so nothing changed the hash between the peek and the locked read, and no test asserted `token_hash` on the locked row. The locked row must still match the presented token, or accept raises `invitation token is no longer valid`. Status and expiry were already read from that row. `accept_invite`, revoke, and issue-token re-check the row they peeked. Bootstrap re-reads the auth email and profile after the family lock. Reset recounts the family name under the family lock. `118_stale_invite_token.sql` requires the hash comparison after the invitation lock. A second session holds the family, starts accept with the original token, rotates the hash, and commits. Accept must fail and must not create a member.
