# Magic link email with six-digit code

## Context
Grandparents may read email on a phone but use the app on an iPad.

## Options considered
- Email link only.
- Link plus 6-digit OTP in the same email.

## Decision
**Link plus code** via local `supabase/templates/magic_link.html` and `signInWithOtp` / `verifyOtp`.

## Consequences
`config.toml` magic_link template; Mailpit used in E2E.

## Status
Accepted

## Date
2026-11-12
