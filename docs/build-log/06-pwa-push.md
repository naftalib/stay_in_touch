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

Left for the reviewer.

### Greptile review

The pull request is not open yet, so Greptile has not commented. The reviewer fills this table.

| # | Comment | File:line | Action | Reason or commit |
|---|---|---|---|---|
| | | | | |

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
