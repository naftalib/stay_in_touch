# Real push smoke test (Chrome + FCM)

**Date:** 2026-11-16

## Goal

Add an on-demand workflow that sends one real notification the whole way: a post, the outbox, the database trigger, `push-send` with `webpush`, FCM, and headed Google Chrome. The service worker must receive and decrypt the who-and-where payload. Handoff 07.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** Grok 4.7 (separate agent)

## PR

Compare link: https://github.com/naftalib/stay_in_touch/compare/main...cursor/push-smoke-dcd3?expand=1

Naftali opens this as a **non-draft** pull request. The builder cannot open it. Suggested title: "Real push smoke test (Chrome + FCM, on demand)".

## What was built

- `.github/workflows/push-smoke.yml`: `workflow_dispatch`, plus a weekly schedule (Monday 04:17 UTC). Concurrency `push-smoke`, `timeout-minutes: 25`, `permissions: contents: read`. No repository secrets. Throwaway VAPID keys from `scripts/push-keys.ts`, masked. `PUSH_TRANSPORT=webpush`. After `db reset`, Vault secrets `push_send_secret` and `push_send_url` (`http://kong:8000/functions/v1/push-send`). A pg_net preflight checks that the database container can reach Kong before Chrome starts. The preflight does not create the smoke message.
- `web/e2e-real-push/real-push.spec.ts` and `web/playwright.real-push.config.ts`. `pnpm test:push:real` (root alias of the same script). The normal suite's `testDir` stays `./e2e`.
- Headed Google Chrome, `channel: "chrome"`, `launchPersistentContext` on a fresh temp profile, under `xvfb` on Linux. `--disable-background-networking` is removed with `ignoreDefaultArgs`. Noa taps **Turn on**. Grandma posts a unique marker through the composer in Noa's space. The test waits for the outbox row to be `sent`, a `push_deliveries` row, and `__lastPush` of title "Stay In Touch", body matching Grandma-in-Noa or N-new-posts-in-Noa, and tag `space:<Noa's space>`.
- `.greptile/config.json`: the `push-no-message-text` rule's `scope` is a string array, `["supabase/functions/**", "web/src/sw.ts"]`.
- ADRs 0095 and 0096. Testing section in `docs/architecture.md`. Run guide in `docs/testing/push-smoke.md`.

## Local attempt

This machine has Google Chrome 157.0.8103.50, xvfb, and outbound internet. Docker 29.1.3 was started here. `supabase start` (CLI 3.1.0) pulled the images, then stopped during "Initialising schema" with `DbSetupError: error running container: exit 1`. The debug log is Realtime's migrator: `DBConnection.ConnectionError` after 15 seconds, the same failure build log 06 recorded on this kind of VM (the Realtime container does not reach Postgres). Enabling IPv6 on the daemon did not change it. The smoke test was not run locally. The GitHub-hosted runner is the run.

## Runs

The green `workflow_dispatch` run (after the temporary push trigger is removed) is filled in below once it finishes.

Bootstrap, from GitHub's rule checked on 16 Nov 2026: `workflow_dispatch` only lists a workflow file that has already run, and a new file is not on the default branch. The first commit on this branch adds `push: branches: ['cursor/push-smoke-*']` so that push registers the workflow. That block is removed before the run that counts. A later `gh workflow run push-smoke.yml --ref cursor/push-smoke-dcd3` is that run.

First bootstrap run, temporary trigger still present: https://github.com/naftalib/stay_in_touch/actions/runs/43944967060 — failed in 1m 31s at "Point the trigger at push-send". `PUSH_TRANSPORT=webpush`, `pg_net` created, Kong alias `kong` on `supabase_network_stay-in-touch`. `vault.create_secret(text,text,text)` was null. Chrome did not start.

Second bootstrap run: https://github.com/naftalib/stay_in_touch/actions/runs/43945834319 — failed in 2m 17s inside the Playwright test, before Chrome. The trigger step passed. `supabase_vault` was already installed (`extension "supabase_vault" already exists`). The printed identity is `vault.create_secret(new_secret text, new_name text, new_description text, new_key_id uuid)`. Vault host `kong:8000`. Preflight `200 {"claimed":0,"sent":0,"skipped":0,"failed":0,"retried":0}`. Google Chrome 157.0.8103.78, Playwright 1.65.0. Playwright rejected the test callback because the first argument was not an object destructuring pattern. The next commit destructures `browserName` and does not use it.

## Review findings and how each was resolved

Not yet. Left for the reviewer (a separate Grok 4.7 agent).

### Greptile review

Not yet. Greptile reviews when the pull request opens (`autoReview` stays `["open"]`). The reviewer fills this table.

| # | Comment | File:line | Action | Reason or commit |
|---|---|---|---|---|

## Deviations from the plan and why

- Notification permission is granted after the Turn on card is visible. Granting it in the context options makes `Notification.permission` already `granted`, and the card stays hidden (`permissionView`). The click is still the app's Turn on button, which calls `Notification.requestPermission` and `PushManager.subscribe`.
- `enablePushFromTap` gives `PushManager.subscribe` 8 seconds (`settled` in `pushClient.ts`). A first FCM registration can take longer. The test does not change that helper. If the browser has an FCM endpoint and the database row is still missing, it reloads once so `ensurePushRegistered` stores the subscription the click already created. Whether that reload was needed is recorded with the run.
- `pg_net` is created in the job when `net.http_post` is missing. `supabase_vault` was already present after `db reset` (`extension "supabase_vault" already exists`). The migration reads Vault only when `vault.decrypted_secrets` exists. No migration or function code changed. `vault.create_secret` is found by name in the `vault` schema. The three-argument `to_regprocedure` check the pgTAP file uses returned null on the runner, because the identity is `(new_secret text, new_name text, new_description text, new_key_id uuid)`. The call still passes three arguments and lets the fourth default.
- The workflow's preflight calls `net.http_post` once, before the test, against an empty (or already settled) outbox. That only checks that Kong answers. The smoke message is posted later, through the composer, and the trigger is what sends it.
- A temporary `push` trigger exists only on the bootstrap commit. It is not in the final workflow file.

## Open questions and decisions made

Decisions 0095 and 0096. Whether to keep the weekly schedule is open: the `schedule` block is contiguous and can be deleted without touching the manual run. Naftali may decline it.

The smoke test covers Chrome on Linux through FCM. Apple Push Notification service, a physical phone, and Firefox stay go-live checks (ADR 0089).

## Follow-ups carried forward

From build log 05:

- Hosted Resend domain go-live (switch `EMAIL_TRANSPORT` only). No Resend key in the repo or CI.
- Turn on hosted Auth email confirmation and set JWT expiry to 600 s (`docs/hosted-settings.md`). Local stays off / 3600 s.
- Gmail SMTP is implemented and unit-tested but not yet sent through a real Gmail account.
- Audit-log viewer, label edits, and family settings UI.
- Realtime payloads are ids only. Resolved in handoff 05 (ADR 0069).
- Leaked-password protection is a paid Supabase feature; not enabled.
- Orphan login cleanup intentionally skips auth users who still have a pending invite.
- Go-live: phone screen-reader check (VoiceOver on iPhone, TalkBack on Android) of sign-in, invite, thread, composer with photos, Pics grid and viewer. Extend that check to install help, the permission card, notification settings, and the update prompt.
- Reconsider video storage if a family member asks for video.
- If photos move to R2: set up a Cloudflare billing alert. If they move to B2: check the no-card daily caps.
- Watch Supabase Free usage. Free projects pause after 7 days without activity. The push sweep counts as activity once Vault secrets exist. The 1-minute sweep keeps the free project awake.
- Hard purge of soft-deleted photos.
- Signed upload links can't be revoked before they expire.

From build log 06:

- Real iPhone and Android test at go-live on the hosted project (ADR 0089).
- Hosted VAPID keys, Vault `push_send_secret` and `push_send_url`, `VITE_VAPID_PUBLIC_KEY` on Cloudflare Pages, and `Cache-Control: no-cache` for `sw.js` and `index.html`.
- Quiet hours were not chosen (ADR 0083).
- Email notifications are not built. The `email` column remains.
- `@negrel/webpush` has no formal crypto audit.

Real push smoke test: done in this handoff (ADR 0095), pending the green dispatched run recorded above. If Chrome on the runner cannot get an FCM endpoint, this line will say so and the workflow stays in the repo for a later try.
