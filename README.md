# Stay In Touch

A private, invite-only app for one family. Parents and children each have a space, grandparents can see every space, and children see only General and their own space.

This repository has the monorepo skeleton and the database. There is no product UI yet. The page in `web/` is a placeholder.

## Layout

```
web/                  Vite + React + TypeScript placeholder
supabase/             CLI project: migrations, seed, pgTAP tests
supabase/functions/   Edge Functions (README only)
api/                  Reserved for a later FastAPI service
docs/                 Architecture, ADRs, build log, hosted settings
.cursor/rules/        Scoped agent rules
.github/workflows/    CI
```

## Prerequisites

- Node.js 22 or newer
- pnpm 10.33.4 (`packageManager` in the root `package.json`)
- Docker
- Supabase CLI 3.1.0

## Local setup

```bash
pnpm install
supabase start
cp .env.example .env
```

The web app reads env from the repo root (`vite.config.ts` sets `envDir` to `..`). After `supabase start`, copy the local API URL and the **publishable** key into `.env`. Do not put the secret key in `VITE_SUPABASE_PUBLISHABLE_KEY`. `.env` is gitignored. Then:

```bash
pnpm dev
```

Other commands:

```bash
supabase db reset          # migrations and seed from scratch
pnpm db:test               # pgTAP
pnpm db:lint               # plpgsql_check and security advisors
pnpm lint && pnpm typecheck && pnpm build
```

`pnpm db:start`, `pnpm db:reset`, and `pnpm db:test` wrap the same Supabase commands.

## Seed logins (local only)

`supabase/seed.sql` creates one demo family. Every account uses the password `local-dev-only`. Do not run the seed against a hosted project.

| Person | Email | Role |
|---|---|---|
| Mom | `mom@example.test` | admin, own space |
| Dad | `dad@example.test` | admin, own space |
| Grandma | `grandma@example.test` | grandparent, no space |
| Grandpa | `grandpa@example.test` | grandparent, no space |
| Noa | `mom+noa@example.test` | member, own space |
| Ari | `mom+ari@example.test` | member, own space |

There is also a pending invitation for `aunt@example.test`. General has a quote-reply and one soft-deleted message. Media rows use fake R2 keys and are marked `ready`.

pgTAP tests do not use this seed. They build a second family and a removed member of their own, then roll back.

## Build journal

How the app was built handoff by handoff: [`docs/build-log/`](docs/build-log/). Architecture decisions: [`docs/decisions.md`](docs/decisions.md).
