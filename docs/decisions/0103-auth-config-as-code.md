# Auth settings for hosted projects live in config.toml

## Context
Hosted Auth must confirm email, use a 600 second JWT, disable public sign-up, and send through Gmail. Local development stays as it is. Supabase CLI 3.1.0 lets a stray `SUPABASE_*` variable override a remote block.

## Options considered
- Click the settings in the dashboard after every deploy.
- `[remotes.test]` and `[remotes.production]` in `supabase/config.toml`, pushed by the deploy script.
- One remote block selected by `SUPABASE_PROJECT_ID`.

## Decision
Each remote sets `site_url` from `APP_URL`, one redirect allow-list entry from `APP_REDIRECT_ALLOW` (the deploy script sets that to `APP_URL` plus `/**`, because `env()` cannot be concatenated), `jwt_expiry` 600, email confirmations on, secure email change on, `enable_signup` false, minimum password length 6, email rate limit 60 per hour, and Gmail SMTP from `GMAIL_SMTP_USER` and `GMAIL_SMTP_PASS`. Seed is disabled on both remotes. The placeholder project ids are the 20-letter shape the CLI requires and are not real projects. The deploy script sets `SUPABASE_REMOTES_TEST_PROJECT_ID` or `SUPABASE_REMOTES_PRODUCTION_PROJECT_ID` and clears other `SUPABASE_*` names before `config push`. Local `config.toml` is unchanged: JWT 3600, confirmations off, email rate 2, seed enabled.

## Consequences
Realtime public access is not a `config.toml` key in CLI 3.1.0. The runbook turns it off in the dashboard. `config push` was not run against a real project in this handoff.

## Status
Accepted

## Date
2026-11-16
