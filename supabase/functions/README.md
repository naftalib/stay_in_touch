# Edge Functions

This folder is where the Supabase CLI looks for Edge Functions (`supabase functions serve` and `supabase functions deploy`). There are no functions yet.

Shared code will live in `_shared/`, which Supabase does not deploy as its own function.

When a function is added:

- Use the caller's JWT for anything row-level security should check.
- Use the secret key only for work the caller must not do directly, such as writing `notification_outbox` or minting media URLs. Never return that key.
- Handle CORS in the function. Current Supabase CLI no longer injects CORS headers for local functions.
