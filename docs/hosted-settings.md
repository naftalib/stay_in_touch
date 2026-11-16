# Hosted project settings

The click-by-click order is [`docs/go-live/runbook.md`](go-live/runbook.md). This page is the list of settings and the ones that are already in git. Do not copy the runbook into a second checklist.

## Already in `supabase/config.toml` for both remotes

Pushed by the deploy script. Local values are different on purpose (JWT 3600, confirmations off, email rate 2, seed on).

- Public sign-up off.
- Confirm email on, and secure email change on.
- JWT expiry 600 seconds.
- Minimum password length 6.
- Auth email rate limit 60 per hour.
- Site URL is `APP_URL`. Redirect allow-list is `APP_URL/**`.
- SMTP is `smtp.gmail.com:465`, user and password from `GMAIL_SMTP_USER` and `GMAIL_SMTP_PASS`, sender name "Stay In Touch".
- Seed disabled. Do not run `supabase/seed.sql` on either hosted project.

## Dashboard, because CLI 3.1.0 has no key for them

- Enable `pg_cron` and `pg_net` before the first database push.
- Realtime: Allow public access off. Clients subscribe with `private: true`.
- If the first `db push` fails with `cannot install the realtime viewer policy` or `must be owner of table messages`, the deploy script runs `scripts/deploy/realtime-policy.sql` and marks migration `20261112160007` applied. Hosted `postgres` can create the policy through supautils and cannot `SET ROLE supabase_realtime_admin`. That repair was not executed against a real project.

## Closed

- **API CORS.** The hosted gateway allows every origin. It cannot be set to the app origin. Edge Functions still reflect only `APP_URL`. Sessions are bearer tokens (ADR 0104).
- **Leaked-password protection.** Pro only. Left off on the free plan (ADR 0104).

## Secrets the deploy script sets

Function secrets are written to a temp file and deleted. The log prints key names only. Hosted setup then upserts Vault `push_send_secret`, `push_send_url`, `media_cleanup_secret`, and `media_cleanup_url`, and schedules `push-send-sweep`, `media-cleanup-daily`, and checks `cleanup-orphan-invite-users`.

Photo bytes stay in the private `photos` bucket (5 MB, `image/jpeg`). The database backup does not include those bytes.

## Still true from earlier handoffs

- The app stops uploads at 800 MB. Free-plan project storage is larger and is shared with the whole project. `scripts/storage-check.sh` fails at 80 percent.
- A free project pauses after 7 days without activity. The one-minute sweep is activity once Vault secrets exist.
- Moving photos to R2 or B2 is still the provider module from handoff 05. R2 has no spending cap. B2's no-card tier has daily caps.
- Rotating the VAPID pair invalidates subscriptions. The client re-subscribes when the public key in the build changes.
- `APP_URL` is the public workers.dev origin. The in-network Kong URL must not be used for push links.
