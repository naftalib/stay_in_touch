# Hosted project settings

There is no hosted project yet. When one is created:

- Turn **public sign-up** off. The local config already has `enable_signup = false`.
- Turn **Confirm email** on, and turn **Secure email change** on. `accept_invite` refuses an unconfirmed address.
- In Realtime, turn **Allow public access** off. Clients subscribe with `private: true` and send the user JWT via `supabase.realtime.setAuth()`.
- Keep JWT expiry short. Realtime checks access when a client subscribes and keeps that result until the token refreshes or the client reconnects. REST updates immediately. Broadcasts carry ids, not message bodies, so an open socket does not receive the text of a post the member can no longer read.
- The migration that installs the Realtime select policy must run as a role that can assume `supabase_realtime_admin`. Hosted `postgres` is not a superuser. Confirm that membership before the first deploy. The local CLI path does not apply on a hosted database, and it does not leave `dblink` installed.
- Configure custom SMTP (Resend) before any real invite email is sent. Until then, invites exist only as rows.
- Do not run `supabase/seed.sql` on the hosted database. Those accounts share a published local password.
- Put the publishable key in `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put the secret key in a `VITE_` variable or in the frontend bundle.
