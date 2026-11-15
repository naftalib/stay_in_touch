# Edge Functions

## Functions

| Function      | Auth                            | Purpose                                                                                                       |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `invite-send` | User JWT (`verify_jwt` default) | Issues invite token via `issue_invitation_token`, ensures auth user exists (service role), sends invite email |

Shared code lives in `_shared/` (not deployed as its own function).

## Local run

1. `supabase start` (includes Edge Runtime and Mailpit).
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` (gitignored) or export the
   same variables.
3. `supabase functions serve --env-file supabase/functions/.env`

Required secrets: `EMAIL_TRANSPORT=mailpit`, `APP_URL=http://127.0.0.1:5173`, `EMAIL_FROM`.

## Tests

From `supabase/functions`:

```bash
deno fmt --check
deno lint
deno check **/*.ts
deno test --allow-env
```

CI runs these in the `functions` job (Deno 2.9.8).
