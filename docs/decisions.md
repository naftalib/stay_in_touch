# Decisions

Decided items from the first handoff. Change this log when a decision changes.

| Decision | Reason |
|---|---|
| Invite-only. Public sign-up is off, including in local `config.toml`. | The product is one family, not an open network. |
| Roles are `admin`, `grandparent`, and `member`, stored on `family_members`. | A person can be in more than one family, so the role cannot live on the profile or in a stale JWT claim. |
| Children see General and their own space only. Grandparents see every space and do not get one. | Matches the family model: parents and children post in their own rooms; grandparents visit all of them. |
| Soft delete only (`deleted_at`). Clients have no hard `DELETE` on content. | Removed posts stay attributable, and a bug cannot erase history. |
| Authors edit their own body. Admins can soft-delete any post and cannot edit the body. | Deletion is moderation. Rewriting someone else's words is not. |
| `family_id` is copied onto content rows and checked against the space. | Policies and indexes filter one column, and a mismatched family cannot be inserted. |
| Object keys only, shape `f/{family}/s/{space}/{media}/original.{ext}` and `thumb.jpg`. | URLs expire and must not contain names or emails. `provider` already includes `mux`. |
| Access helpers live in `private`, security definer, `search_path = ''`. | Avoids policy recursion and keeps the helpers off the Data API. |
| `authenticated` may execute the helpers policies call. `anon` may not. | Policies run as the caller, so Postgres requires `EXECUTE`. The helpers return only that caller's rows. |
| Membership and invite changes are RPCs that write `audit_log`. | Clients must not invent a role or skip the audit trail. |
| `space_audience`, `unread_counts`, and `mark_space_read` are security invoker. | RLS already decides what those rows are. |
| Realtime uses Broadcast from the database on `space:<id>`, private channels only. | Recommended over Postgres Changes for scale, and the topic policy reuses the same visibility helper. |
| The broadcast trigger function is in `private`, not `public`. | A public function would be a Data API endpoint. |
| Plain SQL migrations, not declarative schema. | The handoff asks for versioned migrations as the source of truth. |
| pnpm workspaces. The web linter is oxlint. | The current Vite React TypeScript template ships oxlint rather than ESLint. |
| `api/` is reserved and empty. Edge Functions are only a README. | Later handoffs. The folders already mean one thing each. |
| Local demo password `local-dev-only` for `@example.test` accounts. | Seed must be sign-in-able locally and must never be run against a hosted project. |
| Local Realtime policy is installed via `dblink`, then the extension is dropped. | CLI v3's `postgres` role is not a superuser and cannot own `realtime.messages`. Hosted `postgres` is not a superuser either. The direct path works only when the migration role can assume `supabase_realtime_admin`. Otherwise the local CLI asks the local superuser, using the published local password, and drops `dblink` before the migration commits. | 
| Archived spaces stay visible and are read-only. | `postable_space_ids()` drops a space whose `archived_at` is set. Nobody, including an admin, can insert, edit, or soft-delete messages or media there. An admin calls `unarchive_space` before changing content. |
| Soft-deleted posts stay in the table. Other members cannot read them. The author and admins can. Broadcasts omit the body. | Postgres checks the updated row against the select policy, so the person who deletes a post must still be allowed to read it. Everyone else refetches under RLS and gets nothing. A removed member's already-open socket can still get the notice until the JWT refreshes, but not the text. |
| A message and the media attached to it are one unread item. Standalone media counts as one. | The thread should not tick up once for the words and again for each photo. Media with no message is its own item. A soft-deleted message drops that whole item. |
| A child's `+alias` address is its own auth user. | `accept_invite` matches the signed-in user's confirmed email. A parent accepts the child's invite by signing in as the child. They cannot accept it while signed in as themselves. |
| Hosted JWT expiry should be shorter than the default hour. | Realtime authorizes at subscribe time and keeps that decision until the token refreshes. Local `config.toml` leaves `jwt_expiry` at 3600 so local sessions stay easy to use. |

## Additive on purpose

These are not built. Nothing in the schema blocks them:

- A new `family_role` value such as `relative`.
- `networks` and `network_families`, plus a space owned by a network.
- A `space_grants` table read by `viewable_space_ids()`.
- A `reactions` table.
- Video on Mux, using the existing `provider` value.
