# Go-live: hosted deploys, first family, email, backups

**Date:** 2026-11-16

## Goal

Handoff 08: deploy the PWA and the Supabase project from GitHub Actions, bootstrap the first family without seed data, send invite mail through Gmail, and keep encrypted backups and the storage watch behind the production reviewer.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** Grok 4.7 (a separate agent; findings below)

## PR

https://github.com/naftalib/stay_in_touch/pull/8 on `cursor/go-live-9e85`. Not merged.

## What was built

- `web/wrangler.jsonc` serves `dist` as static assets. Test Worker `stay-in-touch-test`, production Worker `stay-in-touch`, `workers_dev` on, `preview_urls` off. Wrangler `4.163.0` is pinned. `web/public/_headers` is copied into `dist`.
- `.github/workflows/deploy.yml` and `backup.yml`. Logic is in `scripts/deploy/*.sh`, `scripts/backup.sh`, `scripts/restore.sh`, and `scripts/storage-check.sh`. `DEPLOY_TARGET=local` skips Cloudflare and the hosted CLI.
- `[remotes.test]` and `[remotes.production]` in `supabase/config.toml`. Placeholder project ids are not real projects. The deploy script overrides the matching id and clears stray `SUPABASE_*` names before `config push`.
- `public.bootstrap_family` (service role only) and `pnpm bootstrap:family`. It refuses Actions and a git-tracked env file, and it does not print the address.
- Gmail SMTP can be turned off only for a host that is not Gmail. A Deno test speaks SMTP to `127.0.0.1`.
- Hosted setup upserts the four Vault secrets and asserts cron jobs `push-send-sweep`, `media-cleanup-daily`, and `cleanup-orphan-invite-users`.
- If a hosted `db push` fails on the Realtime policy, `scripts/deploy/db-push.sh` applies `scripts/deploy/realtime-policy.sql` and marks `20261112160007` applied. A later migration re-creates the policy only when it is missing.
- CI gained an `ops` job (actionlint, shellcheck, header check, local deploy, bootstrap, backup drill, storage fixtures). The existing web, e2e, functions, and db jobs are unchanged in behaviour except the functions test command now allows net to `127.0.0.1` so the fake SMTP server can listen. `push-smoke.yml` was not edited. `deno check "**/*.ts"` is quoted so actionlint's shellcheck is clean.

## Config diff

`supabase config push` was not run against a real project. There is no access token here. The intended remote values, unverified on a host, are: site URL from `APP_URL`, redirect `APP_URL/**`, JWT 600, confirmations on, secure email change on, sign-up off, minimum password 6, email rate 60 per hour, Gmail SMTP from the environment, seed off. Local config is unchanged.

## Verified locally

- `supabase start` (CLI 3.1.0), including Realtime and the edge runtime, after the VM's legacy iptables FORWARD policy was set to ACCEPT. The first start failed the same way build log 07 recorded (Realtime migrator could not open a TCP connection to Postgres). That was this VM's iptables-legacy FORWARD DROP, not an app bug.
- `supabase test db`: 30 files, 533 tests, pass, including `115_bootstrap_family.sql`.
- `deno test` in `supabase/functions`: 44 passed, including the fake Gmail SMTP server. No connection to Gmail.
- `pnpm test`: 12 files, 46 tests, pass.
- `scripts/deploy/check-build-env.sh`: a test build contains only the fake test URL; a second build contains only the fake production URL.
- `wrangler dev` on `127.0.0.1` with no Cloudflare account: post-deploy check passed (no-cache shell, `sw.js` is JavaScript, deep link `/f/x/s/y/messages` is HTML, hashed assets are immutable, security headers present, notifications not denied by name).
- `scripts/deploy/ops-suite.sh` against the local stack: local deploy, hosted setup twice, bootstrap refuses a populated project, bootstrap with `--force` sends one Mailpit invite and a second run does not add a family, storage check passes at 79 percent and fails at 81 percent for photos and for the database, backup then `db reset --no-seed` then restore, row counts match, Mom signs in with the local seed password, restore refuses production without the flag.
- `supabase db lint` reported no schema errors.
- `pnpm db:types` regenerated `web/src/lib/database.types.ts`.
- `pnpm test:e2e:pwa` (production build, Chromium, WebKit, and iPhone 13): 180 passed. The first parent accepts the bootstrap invite, lands in the new family as admin (General, Mom, Members), and a second run does not add a family. The sign-in helper clicks "Try again" if the membership request fails while the API is restarting after a database reset.

## Not verified on a hosted project

- `supabase link`, `db push`, `config push`, `secrets set`, `functions deploy`, and `wrangler deploy`.
- The Realtime repair path (`realtime-policy.sql` plus `migration repair`). The unit test uses a fake CLI.
- Gmail delivery, the workers.dev subdomain, phone tests, and the test-project restore drill.
- Whether the direct database host `db.<ref>.supabase.co` accepts the password, or whether the pooler is required.
- `pg_net`, `pg_cron`, Vault, and the `photos` bucket on a real project. Locally, all four exist and hosted setup schedules the three jobs.

## Review findings and how each was resolved

Reviewed against the handoff and `uploads/08-review-checklist.md` by a separate Grok 4.7 agent. Greptile scored the builder commit 0/5 with six comments. All six are fixed. None were declined.

### Greptile review

| # | Comment | File:line | Action | Reason or commit |
|---|---|---|---|---|
| 1 | CI rejects its own tests. `GITHUB_ACTIONS=true` refused bootstrap before a family was created, including the tracked-file unit test. | `scripts/bootstrap-family-lib.ts:57` | fixed | `f3363f5`. Actions still refuses a hosted URL. A local URL is allowed, which is the CI path. |
| 2 | `backup.yml` asks for `actions: write` while the deploy caller grants only `contents: read`. | `.github/workflows/backup.yml:30` | fixed | `551e90f`. The write permission is removed. upload-artifact v4 uses the Actions runtime token, and a called workflow cannot raise the caller's grant. |
| 3 | Restore unschedules `cleanup-orphan-invite-users`, and hosted-setup does not recreate it. | `scripts/restore.sh:109` | fixed | `42350db`. `private.schedule_cleanup_orphan_invite_users()` runs from hosted-setup. |
| 4 | Bootstrap needs `EMAIL_TRANSPORT`, the Gmail settings, and `EMAIL_FROM`, which were not checked before it created anyone. | `scripts/bootstrap-family.ts:139` | fixed | `f3363f5`. Those names are required in the env file before any user or invite, and the runbook lists them. |
| 5 | An expired first invite cannot be renewed. | `supabase/migrations/20261116200000_go_live.sql:106` | fixed | `42350db`. A later migration renews a pending invite whose `expires_at` has passed. A different email still cannot take the family name. |
| 6 | Backup checkout ignores `inputs.git_sha` when Deploy calls it through `workflow_run`. | `.github/workflows/backup.yml:37` | fixed | `551e90f`. Checkout is `inputs.git_sha \|\| github.sha`. |

The ops-suite proof of rows 1, 3, and 4 is `fd3fe35`.

### Why the tests did not catch these

| # | Why it slipped through | Test added |
|---|---|---|
| 1 | The tracked-file test never set `GITHUB_ACTIONS`. On a laptop that variable is unset, so the git error won. CI sets it for the whole process, so the Actions error won first and the e2e and ops calls died before creating a family. | The tracked-file test now sets `GITHUB_ACTIONS` and still expects `git tracks it`. A second test allows `http://127.0.0.1` and refuses `https://example.supabase.co`. The ops suite runs the successful bootstrap with `GITHUB_ACTIONS=true` and refuses a hosted URL before any user exists. |
| 2 | Nothing compared the called workflow's token to the caller's. actionlint does not check that intersection. | `guards_test.sh` rejects any permission on `backup.yml` other than `contents: read`, and any `actions` permission on `deploy.yml`. |
| 3 | The restore drill checked row counts and Mom's password. It never ran hosted-setup after unscheduling cron. | pgTAP unschedules the job and asserts the new function recreates exactly one row. The ops suite does the same through `hosted-setup.sh`, including after the restore. |
| 4 | Every fixture env file already had `EMAIL_TRANSPORT` and `EMAIL_FROM`, so the missing-settings path never ran. Nothing checked that a failed send left zero users. | The unit test requires the Gmail names and asserts a sentinel value is not in the error. The ops suite uses an env file without `EMAIL_TRANSPORT` and checks `auth.users` stays empty. |
| 5 | pgTAP re-ran bootstrap while the invite was still pending, then accepted it. It never moved `expires_at` into the past. | The same file expires the invite, rejects a different email, and asserts a new token and a future expiry. |
| 6 | Nothing read the checkout expression. actionlint does not know that a called workflow sees the caller's event name, so `event_name == 'workflow_call'` looked valid. | `guards_test.sh` requires `inputs.git_sha \|\| github.sha` and rejects a `workflow_call` gate. actionlint 1.7.7 is clean on that expression. |

### Other review findings

- **Fixed.** `backup.yml` `workflow_dispatch` did not require `main` in the workflow file. Deploy already does. The backup job now runs a manual dispatch only on `refs/heads/main` (`551e90f`). The production environment is still the only backup environment, and it still has the required reviewer. There is no `production-backup` environment.
- **Fixed.** `bootstrap_family` failures were replaced with the generic text `bootstrap_family failed`, so Naftali would not have seen `family name already exists`. The script now appends the PostgREST message (`f3363f5`).
- **Pass.** `push-smoke.yml` was not edited.
- **Pass.** No real secret, project ref, or Gmail address was added. Placeholders in the runbook are obvious.
- **Pass.** Seed stays off on both remotes. The seed guard tests still pass.
- **Pass.** pgTAP 30 files, 541 tests (8 new), `supabase db lint` clean, security advisors clean. The ops suite passed: local deploy, hosted-setup twice, orphan-job recreate, missing-mail refusal, hosted Actions refusal, bootstrap with `GITHUB_ACTIONS=true`, Mailpit invite, storage 79/81, backup, restore, three cron jobs restored, Mom signs in, production restore refused.
- **Not re-run locally.** `pnpm test`, `pnpm test:e2e:pwa`, and `deno test` under `supabase/functions`. Those trees were not changed. CI still has to run them. The bootstrap e2e calls the same command the ops suite now runs with `GITHUB_ACTIONS=true`.

### Checklist

| Section | Result |
|---|---|
| 0 Run it | Pass for db, ops, actionlint, shellcheck, and the bootstrap Deno tests. Web unit tests, functions Deno tests, and the Playwright suite were left to CI. |
| 1 Secrets and the public repo | Pass. Permissions stay `contents: read`. Production backups, monthly included, use `environment: production`. |
| 2 Data safety | Pass. The restore drill still signs Mom in. Hosted-setup after restore reschedules all three jobs. |
| 3 Bootstrap | Pass. Service-only pgTAP, expired renewal, orphan user kept while the invite is pending. |
| 4 Hosting and headers | Pass on the builder's `wrangler dev` evidence. This review did not repeat that check; the header files were not changed. |
| 5 Deploy correctness | Pass after the backup permission and sha fixes. Order in `deploy.sh` is unchanged. |
| 6 Runbook and phone plan | Pass. The runbook now lists the bootstrap env-file keys and says to run hosted-setup after a restore. |
| 7 Greptile | Pass. 6 comments, 6 fixed, 0 declined. |
| 8 Tests and CI | Pass locally for the new tests. Full CI is the remaining gate. `push-smoke.yml` unchanged. |
| 9 Docs | Pass. ADR 0110 refines 0105. ADR 0004 was already refined by 0097 and was not rewritten. |

## Deviations from the plan and why

- The functions CI test line allows network to `127.0.0.1`. The fake SMTP listener needs it. The tests still do not call Supabase, Cloudflare, or Google.
- `deno check "**/*.ts"` in the functions job is quoted. Actionlint's shellcheck otherwise fails the new ops job on a pre-existing unquoted glob. The command deno runs is the same.
- Content-Security-Policy is not in `_headers` (ADR 0109).
- Schema restore onto a database that already ran the migrations stops at `CREATE TYPE ... already exists`. Restore then loads data. An empty database still takes the schema file.
- `pnpm.onlyBuiltDependencies` includes `esbuild` and `workerd` so Wrangler can install on pnpm 10, which skips dependency build scripts unless they are named.
- The ops job excludes Realtime when it starts Supabase, because a runner that cannot reach the database from the Realtime migrator should still run the database proofs. The full local start on this VM, after the iptables fix, did include Realtime.
- Local Auth has sign-up off and confirmations off, so GoTrue rejects an OTP for an unconfirmed user with "Signups not allowed". The bootstrap script still creates the user unconfirmed, which is what hosted projects need (confirmations on). The browser test confirms that row before requesting the code. pgTAP covers accept when `invited_by` is the invitee.
- The admin heading "Family" sits outside the Spaces navigation, so the browser test looks for it on the side shell.

## Open questions and decisions made

- Workers.dev subdomain: Naftali chooses it once. It is the permanent address (ADR 0097).
- Region: Frankfurt is the example. He picks the closest (ADR 0098).
- One Gmail account for both projects is the documented choice (ADR 0100).
- A production deploy asks for approval twice (ADR 0099, ADR 0108).
- The monthly backup waits until he approves it.
- The account-wide Supabase token is stored only in the two environments (ADR 0099).

## Follow-ups carried forward

From build log 07, moved into this handoff or the runbook:

- Hosted Auth email confirmation and JWT 600 are in the remote config (ADR 0103). Not yet pushed to a real project.
- Gmail is wired and tested against a fake SMTP server. A live send is a runbook step.
- Hosted VAPID, Vault, and `VITE_VAPID_PUBLIC_KEY` are names in the runbook. `no-cache` for the shell is in `_headers` and was checked with `wrangler dev`.
- Real iPhone, Android, VoiceOver, and TalkBack checks are `docs/go-live/phone-test-plan.md`.
- The storage watch runs in the monthly backup (ADR 0102).
- API CORS is closed (ADR 0104).

Still open:

- `@negrel/webpush` has no formal crypto audit.
- Email notifications are not built. The `email` column remains.
- Hard purge of soft-deleted photos.
- Audit-log viewer, label edits, and family settings UI.
- Leaked-password protection is Pro only (ADR 0104).
- Signed upload links cannot be revoked before they expire.
- Reconsider video if a family member asks.
- R2 billing alert or B2 daily caps, if photos move.
- Hosted push smoke test is not part of deploy. The weekly workflow is unchanged.
- In-app feedback button is not built. Rollout uses WhatsApp (ADR 0106).
- Content-Security-Policy (ADR 0109).
- Quiet hours were not chosen (ADR 0083).

## Versions

- Node 22.23.4, pnpm 10.33.4
- Supabase CLI 3.1.0 (3.2.0 exists; this handoff stays on 3.1.0)
- Deno 2.9.8
- Wrangler 4.163.0
- actionlint 1.7.7, shellcheck 0.9.0, age 1.1.1
- Docker 29.1.3, Postgres 17.11
