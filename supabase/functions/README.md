# Edge Functions

## Functions

| Function      | Auth                            | Purpose                                                                                                       |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `invite-send` | User JWT (`verify_jwt` default) | Issues invite token via `issue_invitation_token`, ensures auth user exists (service role), sends invite email |
| `media-upload-url` | User JWT | Reserves a photo and returns signed PUT links |
| `media-finish` | User JWT | Checks the stored JPEG and marks the row ready or failed |
| `media-view-urls` | User JWT | Signed GET links for up to 60 ready photos, one hour |
| `media-cleanup` | `x-media-cleanup-secret` (`verify_jwt = false`) | Deletes orphan objects older than 24 hours, then their rows |

Shared code lives in `_shared/` (not deployed as its own function).

## Local run

1. `supabase start` (includes Edge Runtime and Mailpit).
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` (gitignored) or export the
   same variables.
3. `supabase functions serve --env-file supabase/functions/.env`

Required secrets: `EMAIL_TRANSPORT=mailpit`, `APP_URL=http://127.0.0.1:5173`, `EMAIL_FROM`.

Photo functions also need `MEDIA_PROVIDER=supabase`, `MEDIA_BUCKET=photos`, `MEDIA_PUBLIC_BASE_URL=http://127.0.0.1:54321`, `MEDIA_UPLOAD_MAX_BYTES=5242880`, and `MEDIA_CLEANUP_SECRET` (local value only, not committed). Export them before `supabase start` so the edge runtime receives them. The service-role key is injected by the CLI and must not be logged or returned.

When functions are invoked through local Kong (for example Playwright E2E), they run inside the
Supabase Docker network. Export `MAILPIT_URL=http://inbucket:8025` before `supabase start`, or rely
on the default in `_shared/email.ts`. `supabase functions serve` on the host uses
`MAILPIT_URL=
http://127.0.0.1:54324` from `.env.example`.

## Tests

From `supabase/functions`:

```bash
deno fmt --check
deno lint
deno check **/*.ts
deno test --allow-env
```

CI runs these in the `functions` job (Deno 2.9.8).
