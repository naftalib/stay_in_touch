# Photos

**Date:** 2026-11-15

## Goal

Handoff 05: private photo storage, a provider setting, browser JPEG preparation, composer upload, thread and Pics viewing, orphan cleanup, ids-only Realtime, and the child password minimum of 6.

## Models

- **Builder:** Grok 4.7
- **Reviewer:** Grok 4.7 (separate agent)

## PR

GitHub refused pull-request creation with "must be a collaborator". The branch is pushed. Compare: https://github.com/naftalib/stay_in_touch/compare/main...cursor/photos-6f14

CI in this repo runs on `pull_request` and on pushes to `main`, so this branch has no Actions run. Local results are below.

## What was built

- Migrations `20261115200000_media_provider_values.sql` (`supabase` and `b2` enum values) and `20261115201000_photos.sql` (bucket, limits, reserve/post/ready/failed/orphan RPCs, blank-body rule, ids-only broadcast, cleanup schedule when Vault secrets exist).
- Edge Functions `media-upload-url`, `media-finish`, `media-view-urls`, and `media-cleanup`, plus `supabase` and `s3` provider modules.
- Web: composer attach with progress and retry, thread grid, Pics tab (30 per page), full-screen viewer, video tab hidden, child password minimum 6.
- Tests: `100_photos.sql`, updates to pgTAP 10 and 94, Deno handler tests, Vitest for resize and composer state, Playwright on Chromium, WebKit, and iPhone 13, including axe.

## Review findings and how each was resolved

Reviewed on 2026-11-15 by a separate Grok 4.7 agent. The stack was started locally with storage-api (`supabase start -x studio,imgproxy,logflare,vector,supavisor`) after setting the legacy iptables FORWARD policy to ACCEPT so containers could reach Postgres.

1. **Pending rows were stored as `provider = r2`.** `reserve_photo_upload` inserted `'r2'` and the column default was `r2`, so a supabase-only upload looked like an R2 object until finish. Fixed in `20261115220000_review_photo_fixes.sql` and `media-upload-url`: the reservation records `MEDIA_PROVIDER` (default `supabase`). ADR 0074. Direct client inserts are still rejected by the trigger.
2. **The 800 MB race only checked that one session held the advisory lock.** `101_photo_cap_race.sql` commits a near-cap row on a second connection, starts two reservations, and checks that the second waits on lock `83427601` and then fails with `22023`. Only one pending row is stored.
3. **Signed GET has no `Cache-Control`.** Confirmed on storage-api v1.90.1: the object metadata stores `cacheControl: max-age=31536000`, and `getSignedObject` does not copy it. The response does send `Expires` at the token expiry (observed: one hour after `Date`). The client already reuses the URL for 50 minutes, so a repeat view of that URL is a browser cache hit and does not spend egress. Proxying the bytes would spend egress twice, and a long-lived media-id cache would outlive the one-hour link a removed member may keep. Documented in ADR 0075. No proxy.
4. **Deleting the last photo of a blank message soft-deletes the message.** This matches ADR 0072 and the handoff's suggested behaviour. pgTAP now covers it: one of two photos leaves the message; the last photo soft-deletes a blank message; a message with text stays.
5. **`useBlocker` cannot be used here.** React Router 8.5.1 exports it, and it throws unless the app is inside a data router (`useDataRouterContext`). ADR 0035 uses declarative `BrowserRouter`. Leaving during an upload stays on `beforeunload` plus the confirm dialog for in-app links. The browser Back button is not blocked. Signed upload links still cannot be revoked before they expire (local tokens are 7200 seconds); that remains a follow-up.
6. **A soft-deleted upload that was never posted was invisible to cleanup** and could hold the cap after 24 hours. Those rows are now orphans. Attached soft-deletes stay so an admin can restore them. ADR 0076.
7. **Composer and viewer gaps against the handoff.** Remove is on every preview (`Remove photo N of M`) and aborts the upload. Send explains why it is disabled while a photo is uploading. The picker accepts `image/*` as well as HEIC. Delete asks for confirmation. Thumbnails and the viewer image set width and height.

Local counts are in the reviewer run below. The builder's earlier counts stay in "Local full-stack run".

## Deviations from the plan and why

- Concurrent cap coverage started as the advisory lock plus a reservation that would cross 800 MB. The review adds `101_photo_cap_race.sql`, which runs the second reservation on another session and checks the wait and the `22023` failure.
- `react-router` in this repo does not export `useBlocker`. Leaving during an upload uses `beforeunload` and the existing confirm dialog for in-app links.
- Pending rows used to keep `provider = r2` until finish. The review stores the configured provider on the reservation instead (ADR 0074). The client insert trigger still assigns `r2` and then rejects the insert, so that assignment is never saved.
- The S3 module is untested against a real bucket.
- Signed view responses cache with `Expires`, not `Cache-Control`. See ADR 0075.
- `useBlocker` needs a data router, which this app does not use. See the review notes.
- `realtime.send` adds a top-level broadcast `id` next to `table`, `operation`, and `record`. The record itself is only `id` and `space_id`.
- Deleting the last photo on a blank message also soft-deletes the message, so the thread does not show an empty bubble.

## Open questions and decisions made

Decisions 0061–0073. Signed upload tokens observed locally last 7200 seconds. A raw PUT uses `content-type: image/jpeg`, `cache-control: max-age=31536000`, and `x-upsert: false`, and the storage API returns JSON naming the key. The signed GET that followed returned `content-type: image/jpeg` and no `Cache-Control` header. The photos bucket is inserted by the migration; `storage.buckets` exists when `storage-api` is running, including the CI database job. CLI 3.1.0 serves a publishable key (`sb_publishable_…`) beside the anon JWT. On this VM, container-to-container Postgres was dropped by an iptables-legacy FORWARD policy until that policy was set to ACCEPT. That is an environment fix, not a repo change.

## Local full-stack run

```bash
supabase start -x studio,imgproxy,logflare,vector,supavisor
supabase test db          # 419 pgTAP tests passed
cd supabase/functions && deno test --allow-env   # 26 passed
pnpm test                 # 29 Vitest tests passed
pnpm test:e2e             # 162 passed on Chromium, WebKit, and iPhone 13, including axe
```

`storage-api` was enabled. `MEDIA_PROVIDER=supabase` and `MEDIA_PUBLIC_BASE_URL=http://127.0.0.1:54321` were exported before start. Studio was not started (it would be port 54323).

## Reviewer local run

Same stack, after the review migration. CLI 3.1.0, Deno 2.9.8, storage-api v1.90.1, Postgres 17.

```bash
supabase test db          # 428 pgTAP tests passed
cd supabase/functions && deno fmt --check && deno lint && deno check && deno test --allow-env
                          # 26 Deno tests passed
pnpm lint && pnpm typecheck && pnpm test
                          # 29 Vitest tests passed
pnpm --filter web build   # dist has the publishable key, not the service-role JWT
supabase db lint --fail-on error
supabase db advisors --type security --level warn --fail-on warn
CI=true pnpm --filter web test:e2e
                          # 162 passed (6.1m) on Chromium, WebKit, and iPhone 13, including axe
```

Attacked as Noa, Ari, Grandma, and the anon key: storage list, download, upload, remove, and createSignedUrl failed (an existing object still returned `NoSuchKey` to Noa). Ari cannot read Mom's space or Grandma's pending row, cannot reserve in Noa's space, and `media-view-urls` returned `{}` for that pending id. `mark_media_ready` is denied to Noa. `media-upload-url` without a user JWT and `media-cleanup` without its secret both returned 401. The function omits `Access-Control-Allow-Origin` for a foreign origin; local Kong still adds `*`. That is recorded in `docs/hosted-settings.md`.

A live Grandma upload through `media-upload-url`, raw PUT, and `media-finish` stored a JPEG. The signed view host was `127.0.0.1:54321` (not `kong:8000`), the token TTL was 3600 seconds, and the GET sent `Expires` one hour after `Date` with no `Cache-Control`.

Pull request 5 is https://github.com/naftalib/stay_in_touch/pull/5. CI run [43770819479](https://github.com/naftalib/stay_in_touch/actions/runs/43770819479) on `bd120d6` is green. Job durations: web 22s, functions 12s, db 1m 16s, e2e 8m 22s.

Two earlier runs failed. WebKit missed `tie-alpha` because the older-message loop ran before the thread was painted, and a Playwright click on that button then waited out the test timeout because the list stays scrolled to the bottom. The test now waits for the first page and dispatches the click. The database job once could not bind port 54322 after `supabase start` stopped its first container; it now clears the ports and retries, as the e2e job already did.

## Follow-ups carried forward

From build log 04:

- Hosted Resend domain go-live (switch `EMAIL_TRANSPORT` only). No Resend key in the repo or CI.
- Turn on hosted Auth email confirmation and set JWT expiry to 600 s (`docs/hosted-settings.md`). Local stays off / 3600 s.
- Gmail SMTP is implemented and unit-tested but not yet sent through a real Gmail account.
- Audit-log viewer, label edits, and family settings UI.
- Realtime payloads are ids only. Resolved in this handoff (ADR 0069).
- Leaked-password protection is a paid Supabase feature; not enabled.
- Orphan login cleanup intentionally skips auth users who still have a pending invite.

New:

- Go-live: phone screen-reader check (VoiceOver on iPhone, TalkBack on Android) of sign-in, invite, thread, composer with photos, Pics grid and viewer.
- Reconsider video storage if a family member asks for video (raw MP4 on R2/B2, browser transcode, Stream/Mux).
- If photos move to R2: set up a Cloudflare billing alert (R2 has no spending cap). If they move to B2: check the no-card daily caps.
- Watch Supabase Free usage (1 GB storage, 5 GB egress) in the dashboard; raise the 800 MB cap only with a storage decision. Free projects pause after 7 days without activity.
- Hard purge of soft-deleted photos (objects are kept for admin restore).
- Signed upload links can't be revoked before they expire (hosted: 2 h); acceptable because each covers one path and one reservation.
