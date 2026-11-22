# Bootstrap confirms the auth user, and test can reset an unjoined family

## Context

`pnpm bootstrap:family` created the first parent with `email_confirm: false`. Public signup is off on the hosted projects. GoTrue treats an unconfirmed address as a signup, so "Email me a sign-in code" returns HTTP 422 `signup_disabled` and no code is sent. ADR 0060 fixed that for `invite-send`. Bootstrap was never aligned. Local `config.toml` has email confirmations off, and the remotes have them on (ADR 0103), so CI did not run the hosted Auth shape.

The first hosted test run also sent "Test Family" to `you+test@gmail.com`, which is not an inbox this family reads. The family name already exists, and bootstrap refuses a different email for that name. The test project needs a way to start over.

## Options considered

- Leave the user unconfirmed and turn public signup on. Anyone could create an account.
- Change the pending invite's email in place, and only when the family has no accepted member. That keeps the family row, leaves the stranger's auth user in the project, and special-cases the rule that a different email cannot take the family name.
- Delete the unjoined bootstrap family and the auth user created for it, then bootstrap again with a different address. Refuse production, require an explicit confirmation flag, and refuse any family that is no longer the single pending invite plus the General space.

## Decision

Option 3, plus the ADR 0060 confirmation rule.

`bootstrap:family` calls `auth.admin.createUser` with `email_confirm: true`. If that user already exists and `email_confirmed_at` is null, it calls `auth.admin.updateUserById` with `email_confirm: true` only after `bootstrap_family` succeeds. A refused re-run does not confirm a stranger. If this command created the auth user and `bootstrap_family` fails, that user is deleted. It still does not create a second family for the same name and email.

Reset is `pnpm bootstrap:family --env test --reset --confirm-reset --family "..." --email "..."`. `--env production` is refused before the env file is read, including when `--confirm-reset` is present. `--force` cannot be combined with `--reset`. The script then calls `public.reset_unjoined_bootstrap_family`, which is `service_role` only and requires the confirmation text `confirm-reset`. The work lives in `private`, with a thin public wrapper, the same shape as `bootstrap_family` (ADR 0025). Execute is revoked from `public`, `anon`, and `authenticated`. One transaction locks the family, its invite, and its General space, then locks the auth user before reading sign-in state and holds that lock until the user delete. It deletes that family's audit rows, invite, General space, and family row, then deletes the auth user only when `last_sign_in_at` is null and `auth.sessions` has no row for that user. A missing family is a no-op. A family with a member, content, a sign-in, another invite, or an auth user that is referenced anywhere else is left untouched. The database function cannot tell the test project from production, so the CLI is the production lock.

Changing the invite email was the smaller patch, and it was rejected. The hosted family points at a stranger. Replacing the address would keep that auth user and would weaken the "different email cannot take the name" rule. Reset removes the bootstrap rows and lets the same command create the family again for an inbox Naftali reads.

## Consequences

A re-run against an unconfirmed bootstrap user confirms that user and sends the invite again. It does not create a second family. A re-run that `bootstrap_family` refuses leaves an unrelated unconfirmed user unconfirmed, and it does not keep an auth user the command had just created. Reset does not send mail and does not require the Gmail settings. It still refuses a hosted URL when `GITHUB_ACTIONS` is set. Local Auth stays confirmations-off. The ops job temporarily starts Auth with signup off and confirmations on, runs bootstrap, and expects `signInWithOtp` (`create_user: false`) to return 200 and Mailpit to receive the code. It also expects the unconfirmed user to get `signup_disabled` until bootstrap confirms them. That proof is the last step of `scripts/deploy/ops-suite.sh`, which the ops CI job runs. The suite must not name the production env file; the refusal test rejects the source if it does.

## Refinement

Reset locks the family row before the invitation. `bootstrap_family` used to lock the pending invite and then insert `audit_log`, which takes `FOR KEY SHARE` on the family. `accept_invitation` did the same, and so did `accept_invite`, `revoke_invitation`, and `issue_invitation_token`. If reset held the family and waited for the invite while one of those held the invite and waited for the family, PostgreSQL cancelled one of them.

Those paths now lock the family row and then the invitation. The audit insert runs only after that same transaction holds the family row. A pgTAP source check requires that order in each function. A second session holds the family row, starts `bootstrap_family`, and locks the invitation while it waits. That invitation lock fails if bootstrap still takes the invite first.

`accept_invitation` finds the invite by `token_hash` before that family lock. A resend (`issue_invitation_token`) can rotate the hash while accept waits. After the invitation row is locked, accept requires `token_hash` to still match the presented token and raises `invitation token is no longer valid` when it does not. Status and expiry are read from that locked row. `accept_invite`, `revoke_invitation`, and `issue_invitation_token` re-check existence, family, and status on the locked row; they do not accept a token. `bootstrap_family` re-reads the auth user's email and profile after the family lock. Reset recounts the family name while the matching family rows are locked.

## Status

Accepted

## Date

2026-11-22
