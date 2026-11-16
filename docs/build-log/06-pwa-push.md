# Install, notifications and offline (PWA + push)

**Date:** 2026-11-16

## Goal

Make Stay In Touch installable, tell people when family posts, and keep a typed message when the connection drops. Handoff 06.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** Grok 4.7 (separate agent)

## PR

Compare link: https://github.com/naftalib/stay_in_touch/compare/main...cursor/pwa-push-fa07?expand=1

Naftali opens this as a **non-draft** pull request so Greptile reviews on open. The builder cannot open the pull request. CI in this repo runs on `pull_request` and on pushes to `main`, so this branch has no Actions run until that pull request exists. Local results are below.

## What was built

- Migration `20261116120000_push.sql`: outbox columns, subscription ownership move, preference RPCs, enqueue trigger, Vault-gated one-minute sweep, retention.
- Edge Function `push-send` and `supabase/functions/_shared/push/` (`capture` and `@negrel/webpush`).
- Service worker `web/src/sw.ts` (vite-plugin-pwa `injectManifest`, Workbox 7), manifest, icons, install card, iPhone Home Screen help, permission card, notification settings, offline draft, app badge.
- `.greptile/config.json` and `.greptile/files.json`.
- ADRs 0077–0093.

Versions: vite-plugin-pwa 2.0.0, Workbox 7.4.1, workbox-window 7.4.1, `@negrel/webpush` 0.5.0, Deno 2.9.8, Supabase CLI 3.1.0.

Precache: 19 entries, 851.37 KiB. The `heic-to` chunk is not in it.

## Review findings and how each was resolved

Reviewer: Grok 4.7, a separate agent from the builder. Head at review start was `dc72726`.

The send path never delivered a push. `push_group_facts` and `private.unread_total` call `space_viewer_member_ids`, and that function only returns members of the caller's families. The edge function uses the service role, which has no `auth.uid()`, so every row was `skipped` / `not_member` and the badge was 0. Enqueue still worked, because the trigger runs in the author's session.

The tests missed it for three reasons. pgTAP runs as `postgres`, and `assert_service_role` accepts that session, so a logged-in caller still had `auth.uid()`. The Deno tests stubbed `eligible: true`. The Playwright test never called `push-send`. It checked that `sent_payload` did not contain the message text, and a null payload passes that check. `web/e2e/pwa.spec.ts` even noted that a superuser insert with no JWT notifies nobody.

Enqueue stays on `space_viewer_member_ids`. Pointing it at the unscoped audience function would make fixture and seed inserts (no JWT) create outbox rows and would make `claim_push_batch` order-dependent. A SQL insert with no JWT still enqueues nobody. The app always inserts as the author. ADR 0094.

### Greptile review

Greptile reviewed `dc72726` at confidence 0/5 (review 5922171121, 2026-11-16). Ten inline comments, all fixed. The summary in the pull request body ("Do not merge yet: push delivery skips every recipient, and draft and update flows can discard work") restates those ten and is covered by the same commits. No issue comments. `autoReview` stays `["open"]`.

| # | Comment | File:line | Action | Reason or commit |
|---|---|---|---|---|
| 1 | Push skips every recipient because the service role has no `auth.uid()` | `supabase/migrations/20261116120000_push.sql:629` | fixed | `97091fa`. New `private.space_audience_member_ids`. pgTAP `114_push_service_role.sql` runs as `service_role` with a null uid and expects Mom eligible. The Playwright test calls `push-send` and reads Noa's captured payload. Older pending rows in the same space group into "N new posts in Noa". |
| 2 | Switching spaces overwrites the other draft | `web/src/messages/Composer.tsx:63` | fixed | `055d7d7`. Flush and reload on the draft key. The composer remounts per person and space. Composer test. |
| 3 | The debounce drops the last edit on unmount | `web/src/messages/Composer.tsx:90` | fixed | `055d7d7`. Unmount and space change write `bodyRef`. Composer test. |
| 4 | `controllerchange` reloads other tabs and can drop an upload | `web/src/pwa/UpdatePrompt.tsx:47` | fixed | `055d7d7`. Reload only after this tab pressed Update now. ADR 0079. Vitest. |
| 5 | "This device off" subscribes again on the next open | `web/src/pwa/pushClient.ts:100` | fixed | `055d7d7`. `sit-push-device-off`. Sign-out does not set it. A browser-rotated subscription is not saved while it is set. ADR 0086. Vitest. |
| 6 | A subscription on a retired VAPID key is saved again | `web/src/pwa/pushClient.ts:100` | fixed | `055d7d7`. Compare `applicationServerKey` and re-subscribe. The worker prefers `VITE_VAPID_PUBLIC_KEY` on `pushsubscriptionchange`. ADR 0086. Vitest. |
| 7 | One device's 201 stops retries for the others | `supabase/functions/push-send/handler.ts:209` | fixed | `97091fa`. `push_deliveries`. A 429 or 5xx keeps the group pending. A subscription is skipped only after it accepted every row in the claim. Deno test and pgTAP 114. |
| 8 | Later hides a newer update for the whole session | `web/src/pwa/UpdatePrompt.tsx:66` | fixed | `055d7d7`. Session dismissal clears when a newer worker fires `updatefound`, not on the hourly check. ADR 0079 matches the handoff. Vitest. |
| 9 | The worker ignores `app_badge` | `web/src/sw.ts:40` | fixed | `055d7d7`. `setAppBadge` / `clearAppBadge`, plus the icon and monochrome badge. A bad payload still shows a notification. Vitest. |
| 10 | A deleted post is still notified | `supabase/migrations/20261116120000_push.sql:686` | fixed | `97091fa`. Send-time `skip_reason` `deleted`, after `not_member`. pgTAP 114. The function source still has no message body. |

### Other review findings

| Item | Result | Where |
|---|---|---|
| Ineligible rows in one group shared the first skip reason | fixed | `97091fa`. One `record_push_result` call per reason. Deno test. |
| The shown notification had no icon or monochrome badge | fixed | `055d7d7`. `/pwa-192.png` and `/badge-96.png`. Handoff section 6. |
| A device that accepted one post was treated as finished for a newer post claimed with the retry | fixed | `97091fa`. `delivered_push_subscriptions` requires a row for every id. pgTAP 114. |
| Real web-push smoke test | not added | Later decision, as requested. |

Checklist sections 1–6 and 8–10, from the code and the suites below. Pass unless noted.

1. Privacy. Payload builder has no message-text parameter (`payload.ts`). pgTAP 112 rejects `messages.body` in `push_group_facts`. The new e2e asserts the marker is absent from the captured row and from the function response, and that `navigate` is the app route. Display name is the family label. Logs in the handler are status codes and subscription ids.
2. Subscriptions. Existing pgTAP covers ownership move, non-https endpoints, and anon. 404/410 still deletes. The worker shows a generic notification for a bad payload. Sign-out still unregisters and does not set device-off.
3. Outbox. Catalog test 111 includes the new names. Advisors reported no warnings. The trigger's two steps stay in their own exception blocks. Claim stays `for update skip locked`. Vault still gates the schedule. Secret compare is still SHA-256. 400/413 do not retry once another device succeeded.
4. Preferences. Pause, mute, and all-off are still re-checked in `push_group_facts`. No quiet-hours code. No delete policy added.
5. Service worker. `injectManifest` is unchanged. Precache was 19 entries, 851.37 KiB in the builder's production build. This review did not rebuild, so that size was not re-measured. Navigation denylist is unchanged. `skipWaiting` is still only on `SKIP_WAITING`.
6. Secrets. The new migration has no secret. `pnpm push:keys` still writes only gitignored files. Hosted settings now say a rotated key is compared and a device that is off stays off.
8. Update prompt. `registerType: 'prompt'` unchanged. Later and the other-tab reload are fixed as in the table. The prompt stays `role="status"`.
9. Install and offline. Permission is still only from a tap. Device-off is the new exception to auto-register. Drafts clear on sign-out and the unmount cannot restore them. Badge is applied in the worker.
10. Tests. pgTAP plan counts match. Deno covers the partial device failure and per-reason skips. Vitest covers Later, the reload flag, draft suspend, the badge, the key compare, and device-off. Playwright now posts to `push-send` and reads the notice the worker stored from the captured payload. `getNotifications()` crashes headless Chromium. `PushManager` is still stubbed only in that test.

Concern: container-to-container IPv4 on this VM does not connect, so this agent could not run Playwright or call `push-send` over HTTP. The database, Deno, and Vitest suites did run. CI runs the browser suite.

### Reviewer local run

Docker 29.1.3, Supabase CLI 3.1.0, Deno 2.9.8, Node 22. The realtime migrator sets `ECTO_IPV6=true`. On the default bridge that connection hung for 15 seconds and `supabase start` aborted. Starting on an IPv6 network got through migrations and seed. PostgREST and the edge runtime then failed their 10 second health checks because IPv4 between containers times out. `supabase start --ignore-health-check` left Postgres up.

```bash
supabase test db          # run here as pg_prove against 127.0.0.1:54322
                          # 29 files, 510 tests passed (was 494)
supabase db lint --fail-on error
                          # clean after the temporary pgtap extension was dropped
supabase db advisors --type security --level warn --fail-on warn
                          # no issues
cd supabase/functions && deno fmt --check && deno lint && deno check && deno test --allow-env
                          # 43 passed (was 41)
pnpm --filter web exec oxlint && pnpm --filter web exec tsc -b && pnpm --filter web exec tsc -p tsconfig.sw.json
pnpm --filter web exec vitest run
                          # 11 files, 45 passed (was 38)
```

Playwright was not run here. `http://127.0.0.1:54321` accepts the TCP connection and then does not answer, because Kong cannot reach the other containers. The production-build browser run is the CI e2e job.

## Deviations from the plan and why

- `set_notifications_enabled` and `set_notifications_paused` take `p_family_id`. One person can belong to more than one family (ADR 0015). The handoff sketch omitted the argument.
- `private.notify_push_send` calls `net.http_post` through dynamic SQL. Local Postgres has `pg_cron` and does not have `pg_net`, and `plpgsql_check` rejects a direct `PERFORM net.http_post` when schema `net` is absent. The call is still skipped when `net.http_post` is missing.
- The seed space title is "Noa", so the body is "Grandma posted in Noa", not the handoff's illustrative "Noa's space".
- Headless Chromium reports `Notification.permission` as `denied` and cannot reach a real push service. The end-to-end test, only, stubs `PushManager.subscribe` / `getSubscription` and the permission getter. Nothing in the app stubs them.
- CDP `ServiceWorker.deliverPushMessage` delivers the payload. CDP has no notification click, so the worker accepts `{ type: "NOTIFICATION_CLICK", url }` and the page also listens for `{ type: "NAVIGATE" }`. `WindowClient.navigate` did not move the Playwright page on its own.
- Permission and install cards use `role="region"`. `role="status"` collided with existing tests that read the only status ("Invitation sent."). The update prompt stays `role="status"`.
- The cards are `position: fixed`, below the header, and narrower than the viewport, so they do not cover the Spaces button on a phone. An in-flow card pushed the shell down and a full-width card covered that button.
- Playwright WebKit never settles `serviceWorker.getRegistration()` when notification permission was not granted. Sign-out and the settings read return immediately in that case, and otherwise stop waiting after 8 seconds, so sign-out cannot stick.
- The notification switch input is visually hidden. The end-to-end mute uses the keyboard (Space), which is how the switch operates. A hit-test click lands on the track and never reaches the input.
- Generated `database.types.ts` types `set_notifications_paused.p_until` as `string`. Resume passes `null` with a comment. The file is the generator output.
- Grid photo fixtures used `created_at` of 2026-11-15. On 2026-11-16 the later orphan-cleanup test deleted them as older than 24 hours, so Ari's Pics looked empty. The fixture now uses `now()`.
- WebKit does not pass a service-worker-controlled storage upload to `page.route`. The retry test fails the first `XMLHttpRequest` to `/object/upload/` in the page, after the service worker is controlling, by calling that request's error handler.
- The same-timestamp thread test used to require the Load older button to stay on the page. On the iPhone viewport the list can load the rest by itself when it is still at the top, so the button is already gone. The test now accepts "Beginning of the thread" in that case. The offline thread test expects Send to stay on screen and disabled, with the saved-draft message.

## Open questions and decisions made

Decisions 0077–0093. Quiet hours were considered and not chosen (ADR 0083). Email notifications stay a column only. A real iPhone and Android install is a go-live check (ADR 0089). `@negrel/webpush` has no formal crypto audit; `PushSender` is the seam (ADR 0081).

`pg_net` is not created in this local database. The sweep is not scheduled until Vault holds `push_send_secret` and `push_send_url`. A one-minute sweep on a hosted free project is database activity, so the project does not pause for inactivity; it also spends the free cron allowance every minute.

Rotating the VAPID pair invalidates every subscription. The next signed-in open re-registers when permission is already granted.

## Local full-stack run

```bash
supabase start -x studio,imgproxy,logflare,vector,supavisor
supabase test db          # 494 pgTAP tests passed (28 files)
supabase db lint --fail-on error
supabase db advisors --type security --level warn --fail-on warn
cd supabase/functions && deno fmt --check "**/*.ts" "**/deno.json" && deno lint && deno check **/*.ts && deno test --allow-env
                          # 41 passed
pnpm lint && pnpm typecheck && pnpm --filter web test
                          # Vitest: 11 files, 38 passed
pnpm --filter web build   # precache 19 entries, 851.37 KiB
CI=true pnpm --filter web test:e2e
                          # Playwright: 179 passed, 4 skipped (6.8m)
```

GitHub Actions does not run on this branch until a pull request is opened.

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
- Watch Supabase Free usage. Free projects pause after 7 days without activity. The push sweep counts as activity once Vault secrets exist.
- Hard purge of soft-deleted photos.
- Signed upload links can't be revoked before they expire.

New:

- Real iPhone and Android test at go-live on the hosted project (ADR 0089).
- Hosted VAPID keys, Vault `push_send_secret` and `push_send_url`, `VITE_VAPID_PUBLIC_KEY` on Cloudflare Pages, and `Cache-Control: no-cache` for `sw.js` and `index.html`.
- Quiet hours were not chosen (ADR 0083).
- Email notifications are not built. The `email` column remains.
- `@negrel/webpush` has no formal crypto audit.
