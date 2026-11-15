# Hosted project settings

There is no hosted project yet. When one is created:

- Turn **public sign-up** off. The local config already has `enable_signup = false`.
- Turn **Confirm email** on, and turn **Secure email change** on. `accept_invite` refuses an unconfirmed address.
- In Realtime, turn **Allow public access** off. Clients subscribe with `private: true` and send the user JWT via `supabase.realtime.setAuth()`.
- Set **JWT expiry** to **600 seconds** (Authentication → JWT expiry). Realtime checks membership when a client subscribes and keeps that decision until the token expires and the client refreshes or reconnects. The web client clears Realtime channels on `TOKEN_REFRESHED` so removed members pick up loss of access quickly. REST updates in the same transaction as the membership change. Local `config.toml` leaves `jwt_expiry = 3600` for developer convenience.
- The migration that installs the Realtime select policy must run as a role that can assume `supabase_realtime_admin`. Hosted `postgres` is not a superuser. Confirm that membership before the first deploy. The local CLI path does not apply on a hosted database, and it does not leave `dblink` installed.
- **Prototype email (no owned domain yet):** use **Gmail SMTP** (`smtp.gmail.com:465`, app password in secrets only) for Supabase Auth sign-in codes and set Edge Function secrets `EMAIL_TRANSPORT=gmail`, `GMAIL_SMTP_USER`, `GMAIL_SMTP_PASS`, `EMAIL_FROM`, `APP_URL`. Expect ~500 messages/day limits and spam-filter risk.
- **Go-live:** verify a domain in Resend, switch Auth SMTP and `EMAIL_TRANSPORT=resend` with `RESEND_API_KEY`; no code change.
- Function secrets for invite email: `EMAIL_TRANSPORT`, `APP_URL`, `EMAIL_FROM`, and provider-specific keys.
- Set **minimum password length** to **8** for adults on hosted; child invite setup UI enforces **6** minimum (see ADR 0058).
- Do not run `supabase/seed.sql` on the hosted database. Those accounts share a published local password.
- Put the publishable key in `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put the secret key in a `VITE_` variable or in the frontend bundle.
