# Bootstrap confirms the user, and test can start over

**Date:** 2026-11-22

## Goal

Handoff 10: `bootstrap:family` created an unconfirmed auth user, so the hosted invite page got HTTP 422 `signup_disabled` when it requested a sign-in code. Confirm that user the same way invite-send does, repair an existing unconfirmed user on a re-run, and give the test project a safe way to delete the unjoined "Test Family" that was sent to `you+test@gmail.com`.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** not run in this handoff

## PR

Link added when the pull request opens.

## What was built

- `findOrCreateUser` creates the auth user with `email_confirm: true`. If the address already exists and is unconfirmed, `updateUserById` confirms it. The same family name and email still reuse one family.
- `--reset --confirm-reset` is test-only. Production is refused before the env file is read. `public.reset_unjoined_bootstrap_family` deletes one unjoined bootstrap family, its General space, its pending invite, its audit rows, and that invite's auth user. A family with a member, content, a sign-in, or any other row is left in place. A second reset is a no-op.
- The runbook's test invite address is `<your-gmail>+mom@gmail.com`. Plus-addresses of `breuningapp@gmail.com` are the inbox that works. The current test project has PowerShell commands to reset `you+test@gmail.com` and bootstrap again.
- Ops CI runs bootstrap against local Auth with signup off and confirmations on, then `signInWithOtp` with `create_user: false`. An unconfirmed user gets 422 `signup_disabled`. After bootstrap, Mailpit receives the code. Reset's production refusal and the member refusal run in the same job. pgTAP covers the delete bounds.

## Review findings and how each was resolved

Not yet. No review has run on this handoff.

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
