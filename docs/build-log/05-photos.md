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

Left for the reviewer.

## Deviations from the plan and why

- Concurrent cap coverage is the advisory lock held to the end of the transaction, plus a reservation that would cross 800 MB. A second pgTAP session cannot see the uncommitted fixture, so a true race is not in the SQL test.
- `react-router` in this repo does not export `useBlocker`. Leaving during an upload uses `beforeunload` and the existing confirm dialog for in-app links.
- Pending rows keep `provider = r2` until `mark_media_ready` sets `supabase`. The client insert trigger still forces `r2`, and the reserve path inserts as the function owner so it can keep that default until finish.
- The S3 module is untested against a real bucket.
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
