# ADR 0060: Confirm invite auth users at creation

## Status

Accepted

## Date

2026-11-15

## Context

`invite-send` creates the auth user when the invitation email goes out, because public signup is disabled. The first version passed `email_confirm: false` and expected the OTP to confirm the address.

Local Auth has `enable_signup = false` and `enable_confirmations = false`. Creating the user unconfirmed and then calling `signInWithOtp` with `shouldCreateUser: false` still returns `signup_disabled`. GoTrue treats the unconfirmed address as a signup. No code email is sent, so the invite page cannot be completed.

## Options considered

1. Leave `email_confirm: false` and set `enable_signup = true`. Anyone could create an account.
2. Leave `email_confirm: false` and turn local email confirmations on. OTP still failed in this configuration while signup was closed.
3. Create the user with `email_confirm: true`. Signup stays closed. The person still has to enter the OTP from their inbox before `accept_invitation` runs, and accept still requires a confirmed email that matches the invitation.

## Decision

Option 3. `invite-send` calls `auth.admin.createUser` with `email_confirm: true`.

## Consequences

An admin-typed address becomes a confirmed auth user as soon as the email is sent, even if the person never accepts. They cannot join until they prove inbox access and the token is still pending. Orphan cleanup still skips anyone who has signed in. Hosted projects should keep public signup disabled. ADR 0112 applies the same confirmation to `bootstrap:family`, including a re-run that confirms an existing unconfirmed user.
