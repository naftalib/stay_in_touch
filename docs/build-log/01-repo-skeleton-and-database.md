# Repo skeleton and database layer

**Date:** 2026-11-12

## Goal

First handoff: monorepo skeleton, full Postgres schema with RLS for admin / grandparent / member roles, pgTAP tests, seed data, CI, and docs. No product UI, Edge Functions, or FastAPI.

## Models

- **Builder:** Grok 4.7 (cloud agent)
- **Reviewer:** Claude Opus 5.5 (high effort)

## PR

https://github.com/naftalib/stay_in_touch/pull/1 (merged 2026-11-12)

## What was built

- Layout: `web/` (Vite + React + TypeScript placeholder), `supabase/` (8 migrations, seed, 17 pgTAP files), `supabase/functions/` and `api/` (README only), `docs/`, `.cursor/rules/`, `.github/workflows/ci.yml`.
- Twelve tables, `private` helpers, RLS, admin/invite RPCs, Realtime broadcast triggers, local Realtime select policy migration.
- Placeholder web page; 273 pgTAP tests passing at merge; CI green on commit `08936a5`.

Details are in the [PR description](https://github.com/naftalib/stay_in_touch/pull/1#issuecomment) and [`docs/architecture.md`](../architecture.md).

## Review findings and how each was resolved

**First review verdict: merge after fixes.**

| Severity | Finding | Resolution |
|---|---|---|
| High | `dblink` superuser pivot left installed and callable by client roles | Migration creates and drops `dblink` in the same transaction; extension not left installed |
| High | Authors could undo an admin's moderation delete and edit deleted posts | Only admins clear `deleted_at`; deletes stamped with `now()`; body/caption edits blocked when deleted |
| High | Removed members kept receiving full Realtime payloads on open subscriptions | Mitigated: broadcasts omit body, caption, and object keys; documented JWT/Realtime behavior in architecture and hosted settings |
| Medium | Clients could set server-owned fields on insert | Column-level insert grants plus trigger resets |
| Medium | Free-form `profiles.avatar_key` | Shape check `u/{user_id}/avatar/...` |
| Medium | Soft-deleted content readable by all viewers | Select policy hides deleted rows from non-author non-admins; broadcasts slimmed |
| Medium | Incorrect claim that hosted `postgres` is superuser | Corrected in decisions and hosted settings |

Low items (invite races, last-admin guard race, re-invite with existing space, grandparent space owner, dead expired-invite code, confirmed email on accept, shared visibility helper, test gaps) were addressed before merge. See the [first review comment](https://github.com/naftalib/stay_in_touch/pull/1#issuecomment) for the full list.

**Recheck verdict (commit `08936a5`): ready to merge.** 273/273 pgTAP, CI [run 43269988943](https://github.com/naftalib/stay_in_touch/actions/runs/43269988943) green.

## Deviations from the plan and why

- **oxlint** instead of ESLint — matches the current Vite React TypeScript template.
- **Realtime policy in its own migration** with local `dblink` superuser path — CLI v3 `postgres` cannot own `realtime.messages`; hosted needs a role that can assume `supabase_realtime_admin`.
- **Broadcast trigger in `private`** — avoids exposing a Data API endpoint.
- **`authenticated` may execute policy helpers** — required because policies run as the caller.
- **Composite FKs plus triggers** for `family_id` consistency.
- **Security invoker** on read RPCs; **security definer** on privileged writes.
- Other items listed in the PR body under "Deviations".

## Open questions and decisions made

Product owner decisions during the review cycle (also in [ADR 0019](../decisions/0019-product-decisions-from-review.md)):

- Archived spaces are **read-only for everyone**; admin must `unarchive_space` before content changes.
- A message and its attached media count as **one unread item**.
- A child's **+alias account is its own login**; parent signs in as the child to accept the invite.
- **Deleted message text** is visible only to the author and admins; broadcasts are id-only for sensitive fields.
- Document **shorter hosted JWT expiry** than local default (see [hosted settings](../hosted-settings.md)).

Recommendations from the recheck for two product questions:

- **Block renaming an archived space** (or treat rename like other content edits).
- **Hide media attached to a soft-deleted message** (cascade visibility or soft-delete media with the message).

## Follow-ups carried forward

Six low items from the [recheck comment](https://github.com/naftalib/stay_in_touch/pull/1#issuecomment) remain open:

1. `private.space_viewer_member_ids(uuid)` can return ids for spaces outside the caller's families when called directly in SQL — restrict to caller's memberships.
2. `accept_invite` unarchives a returning member's space with **no audit row**.
3. **Product question:** `rename_space` may still change an archived space (docs say read-only is content-only).
4. Broadcasts still carry metadata beyond ids (author, timestamps); removed members on an open socket learn who posted when.
5. **Product question:** media attached to a soft-deleted message stays visible unless deleted separately.
6. Stale "Known gaps (TODO until fixed)" comments in review test files `92`, `93`, `94`.

Extra reviewer tests live on branch **`cursor/review-01-tests`** (`95_review_recheck.sql`, 26 assertions, 3 TODO); **not merged** yet.
