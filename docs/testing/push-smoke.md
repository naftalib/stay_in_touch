# Real push smoke test

This check sends one real notification through Google. It is separate from `pnpm test:e2e`. Pull requests do not run it.

The path is: Grandma posts in Noa's space → `notification_outbox` → the database trigger → `pg_net` → `push-send` with `PUSH_TRANSPORT=webpush` → FCM → headed Google Chrome. The service worker's `__lastPush` is the who-and-where text Chrome decrypted.

A local run with `PUSH_TRANSPORT=webpush` really sends through Google. The VAPID keys are throwaway. Do not point this at a hosted project.

## From the Actions tab

1. Open the repository on GitHub and choose **Actions**.
2. Choose **Push smoke test** in the left sidebar.
3. Choose **Run workflow**, pick the branch, and start it.
4. The job log prints `push-smoke subscribe_ms=…` and `push-smoke delivery_ms=…`, plus the Chrome version and the Vault host (`kong:8000` on the local stack).
5. On a failure, the log prints the outbox row (status, `last_status`, `skip_reason`, attempts), the `push_deliveries` count, the FCM code or `2xx (library)`, the edge runtime log, the service-worker console, and the Chrome version. The same text is written to the artifact **push-smoke-diagnostics**, with the Playwright trace under `web/test-results/`.

The workflow also has a weekly schedule (Monday 04:17 UTC). Schedules run only on the default branch. GitHub turns a scheduled workflow off after 60 days without repository activity; turn it back on from the Actions tab. Delete the `schedule` block in `.github/workflows/push-smoke.yml` to keep the manual run and drop the weekly one.

## Locally

You need Docker, Google Chrome, outbound internet, Node 22, pnpm 10.33.4, the Supabase CLI 3.1.0, and Deno 2.9.8. On Linux you also need `xvfb`.

```bash
pnpm install
pnpm push:keys
```

`pnpm push:keys` writes a throwaway pair into gitignored `.env.local` and `supabase/functions/.env`. Export those values before starting Supabase so the edge runtime and the app share one pair. `PUSH_TRANSPORT` must be `webpush`.

```bash
set -a
. supabase/functions/.env
. .env.local
set +a
export PUSH_TRANSPORT=webpush
export PUSH_SEND_SECRET=local-push-dev
export APP_URL=http://127.0.0.1:5173
export MAILPIT_URL=http://inbucket:8025
export EMAIL_TRANSPORT=mailpit
supabase start -x studio,imgproxy,logflare,vector,supavisor
supabase db reset
```

The database container has to reach Kong by the Docker network name, not by `127.0.0.1` (that address is the database container itself). After the reset, create the extension if it is missing and store the two Vault secrets:

```bash
docker exec -i supabase_db_stay-in-touch psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pg_net;
create extension if not exists supabase_vault;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_send_secret') then
    perform vault.create_secret('local-push-dev', 'push_send_secret', 'push smoke');
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'push_send_url') then
    perform vault.create_secret('http://kong:8000/functions/v1/push-send', 'push_send_url', 'push smoke');
  end if;
end
$$;
SQL
```

A later `supabase db reset` clears the secrets. Run the block again after a reset. The smoke test also creates them when they are missing, so a reset followed by `pnpm test:push:real` still sets `http://kong:8000/functions/v1/push-send` unless `PUSH_SMOKE_PUSH_URL` overrides it.

Copy the local API URL and the publishable key into `.env` (see the main README). Then build and run:

```bash
pnpm --filter web build
# Linux
xvfb-run -a pnpm test:push:real
# macOS or Windows, where Chrome already has a display
pnpm test:push:real
```

`pnpm test:push:real` does not reset the database. A reset would drop the Vault secrets. The Playwright config starts `pnpm preview` on port 5173, so that port needs to be free.

Subscribe is allowed 90 seconds. Delivery is allowed 120 seconds. The test timeout is 6 minutes, with at most one retry. The browser unsubscribes and the temporary Chrome profile is deleted when the test ends.

To see whether Playwright's `--disable-background-networking` switch matters, run once with it left on:

```bash
PUSH_SMOKE_KEEP_BACKGROUND_NETWORKING=1 xvfb-run -a pnpm test:push:real
```

The shipped test removes that switch. The build log records what happened.
