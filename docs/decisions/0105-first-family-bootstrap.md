# First family is bootstrapped on Naftali's computer

## Context
Hosted projects must not run `seed.sql`. The first parent has to exist before anyone can send an invite, and the invite has to come from the normal email path.

## Options considered
- Run the seed on the hosted database.
- Create the auth user in the dashboard and insert the family by hand.
- One service-only RPC, run by a Deno script on Naftali's computer, which then sends the normal invite email.

## Decision
`public.bootstrap_family` is executable only by `service_role`. It creates the family, the General space, and an admin invitation with `create_space` so the parent gets a space. The same family name and email reuse the rows and only re-send. `pnpm bootstrap:family` reads `SUPABASE_URL` and `SUPABASE_SECRET_KEY` from a gitignored `.env.<env>.local`, refuses GitHub Actions, and refuses a git-tracked env file. It does not print the email address. The first parent accepts on the normal invite page. `accept_invitation` already allows `invited_by` to be the invitee. Orphan cleanup does not delete that user while the invite is pending.

## Consequences
The script is never a GitHub Actions step, because those logs are public. A project that already has members is refused unless `--force`.

## Status
Accepted

## Date
2026-11-16
