# Hosted project settings

There is no hosted project yet. When one is created:

- Turn **public sign-up** off. The local config already has `enable_signup = false`.
- In Realtime, turn **Allow public access** off. Clients subscribe with `private: true` and send the user JWT via `supabase.realtime.setAuth()`.
- Configure custom SMTP (Resend) before any real invite email is sent. Until then, invites exist only as rows.
- Do not run `supabase/seed.sql` on the hosted database. Those accounts share a published local password.
- Put the publishable key in `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put the secret key in a `VITE_` variable or in the frontend bundle.
