# Stay In Touch

A private, invite-only app for one family. Parents and children each have a space, grandparents can see every space, and children see only General and their own space.

This repository has the database, signed-in screens, invite email, and photos. Grandma can post a photo in Noa's space. The Pics tab lists the space's photos. Video is hidden.

## Layout

```
web/                  Vite + React + TypeScript app
supabase/             CLI project: migrations, seed, pgTAP tests
supabase/functions/   Edge Functions (invite email and photos)
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
pnpm test                  # Vitest unit tests in web/
pnpm test:e2e              # Playwright; needs supabase start, .env, and a built or running app
```

`pnpm test:e2e` resets the local database, then runs Chromium, WebKit, and the iPhone 13 project one at a time against `http://127.0.0.1:5173`. Set `CI=true` to exercise the production preview build (`pnpm --filter web build` first). `pnpm test:e2e:pwa` builds, then runs that same suite with the service worker (`PWA_E2E=1`). The suite shares one database, so it does not run tests in parallel.

A real push smoke test is separate from that suite. It opens headed Google Chrome and sends one notification through Google (FCM). Run it from the Actions tab (Push smoke test → Run workflow) or locally. A local run with `PUSH_TRANSPORT=webpush` really sends through Google. Steps: [`docs/testing/push-smoke.md`](docs/testing/push-smoke.md).

`pnpm push:keys` writes a throwaway VAPID pair into gitignored `.env.local` and `supabase/functions/.env`. Export `PUSH_TRANSPORT=capture` and `PUSH_SEND_SECRET=local-push-dev` before `supabase start` for local push. Do not commit those files.

`pnpm db:start`, `pnpm db:reset`, and `pnpm db:test` wrap the same Supabase commands.

### Trying invites locally

1. Serve functions with Mailpit transport: copy `supabase/functions/.env.example` → `supabase/functions/.env`, then `supabase functions serve --env-file supabase/functions/.env`.
2. Sign in as Mom, open **Family → Members**, invite someone. The email lands in Mailpit (`http://127.0.0.1:54324`).
3. Open `/invite#…` from that email, request a sign-in code (also in Mailpit), then **Join**.
4. Deno tests: `cd supabase/functions && deno test --allow-env`.

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

There is also a pending invitation for `aunt@example.test`. General has a quote-reply and one soft-deleted message. Seed photos are marked `ready` and use stored keys. Studio, when started, is on port 54323. The default `supabase start` for this handoff leaves Studio off.

pgTAP tests do not use this seed. They build a second family and a removed member of their own, then roll back.

## Build journal

How the app was built handoff by handoff: [`docs/build-log/`](docs/build-log/). Architecture decisions: [`docs/decisions.md`](docs/decisions.md).
