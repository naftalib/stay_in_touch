# First screens: sign-in, app shell, message threads

**Date:** 2026-11-12

## Goal

Handoff 03: auth, role-filtered app shell, WhatsApp-style thread, carry-over database fixes, Vitest/Playwright/axe, CI E2E job, build journal ADRs 0035+.

## Models

- **Builder:** Composer 2.5
- **Reviewer:** Grok 4.7 (ADR 0020)

## PR

Open on branch `cursor/first-screens-2787` (not merged).

## What was built

- **Database:** Migration `20261112200000_carry_over_fixes.sql` (helper, `rename_space`, `accept_invite` audit, `media_select`); seed +120 General messages; magic link template; pgTAP `96_deleted_message_media.sql`; merged `95_review_recheck.sql` TODOs removed.
- **Web:** Routes per spec; sign-in password + OTP; app shell with drawer, tabs, audience line, text size; thread with infinite scroll, edit/delete/reply, realtime id-refetch, unread badges; Pics/Video placeholders.
- **CI:** Web job runs Vitest; new `e2e` job with local Supabase, types drift check, Playwright (Chromium + WebKit + iPhone 13).
- **Docs:** `architecture.md` web layout; ADRs 0035–0045; filled Options on older ADRs per review.

## Review findings and how each was resolved

Reviewed on the branch by Grok 4.7 against the handoff and `03-review-checklist.md`. Local Supabase and Playwright (Chromium, WebKit, iPhone 13) were run against the preview build.

### Review and fixes

- **Child nav role leak (high).** `family_members` select returns the whole family. The client treated the first row as the signed-in person, so a child inherited a parent's role and the sibling query never ran. Memberships are now limited to the session user, and sibling names come from `nav_child_sibling_labels` (labels only). ADR 0046.
- **Auth lock.** `onAuthStateChange` no longer awaits other Supabase calls. Display name loads in a separate effect. That deadlock had also left the sibling list empty.
- **Sign-in.** Unknown emails get the same confirmation as a real magic-link send. Return paths accept only same-origin paths, including `?next=`. Expired or reused links show a way back to sign-in. `flowType: 'pkce'` stays explicit.
- **Realtime.** `setAuth` finishes before subscribe. Handlers read only id, space id, and table name, then refetch under RLS. Reconnect, focus, and coming back online refresh the newest page. React Aria `RouterProvider` sits inside `BrowserRouter`.
- **Thread.** Scroll position is kept when older pages load. Quotes the viewer cannot read say "Original message unavailable". Edit and delete stay open and show an error when the database refuses the change.
- **Tests.** `realtime.spec.ts` is a real two-context test. Playwright uses one worker because the suite shares one database. axe covers sign-in, General in light and dark, the drawer, the unavailable screen, the delete dialog, and extra-large text.

VoiceOver and NVDA were not available on this Linux VM. Keyboard behavior and axe (WCAG 2.2 AA tags) were run locally. A removed member stops seeing the family on the next membership load; Realtime authorization can keep an existing socket until the access token refreshes (`jwt_expiry`, one hour). That delay is a known Supabase limitation and was not re-timed with a shortened JWT in this pass.

## Deviations from the plan and why

- **Supabase `magic_link` template path:** `content_path` must be `./supabase/templates/magic_link.html` from repo root (CLI 3.1.0); initial `./templates/...` failed at start.
- **`database.types.ts`:** Committed from implementation pass; CI regenerates on the E2E job.
- **Playwright workers:** One worker. Parallel projects were racing on the shared seed database.
- **React Aria `RouterProvider`:** Wired. `replace` is not forwarded because augmenting `RouterConfig` in this React Aria version collapsed unrelated component props. Normal link clicks do not need `replace`.

## Open questions and decisions made

- **supabase-js `flowType`:** Set to `pkce` in `web/src/lib/supabase.ts`. The same browser exchanges the magic-link code; the 6-digit code uses `verifyOtp`.
- **React Aria `RouterProvider`:** Wired inside `BrowserRouter`. See the deviation above for `replace`.
- See ADRs [0035](../decisions/0035-routing.md)–[0046](../decisions/0046-child-nav-sibling-labels.md).

## Follow-ups carried forward

- Invite acceptance UI and `accept_invite` from client.
- Photo/video upload, R2 signed URLs, media rendering.
- Admin tools, push, offline send queue, password reset UI.
- PWA service worker (do not cache Supabase API).
- Slim realtime payload to ids only server-side (UI already id-only).
- Hebrew/RTL translations (logical CSS in place).
- Shorten Supabase `jwt_expiry` (for example 10–15 minutes) and verify a removed member's open Realtime socket loses access within that window, with a test.
- Manual screen-reader pass (VoiceOver on iOS Safari, TalkBack or NVDA) on sign-in, the thread, and the spaces drawer. The Linux review VM had none.

## Manual accessibility check

Keyboard sign-in, posting, and the spaces drawer (Enter to open, Escape to close, focus returns) were exercised in Chromium, WebKit, and the iPhone 13 project. axe (WCAG 2.2 AA tags) reported no violations on sign-in, General in light and dark, the drawer, the unavailable screen, the delete dialog, and extra-large text at 320px. VoiceOver and NVDA were not available on the Linux review VM.

## CI E2E duration

GitHub Actions run [43325444730](https://github.com/naftalib/stay_in_touch/actions/runs/43325444730) on `3f6831f`: the `e2e` job took 4 minutes 6 seconds. Playwright reported 84 passed in 2.1 minutes (Chromium, WebKit, and iPhone 13, one worker, no retries). A local preview run the same day was 84 passed in 1.7 minutes. `web` took 23 seconds and `db` took 1 minute 15 seconds.
