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
| Local Realtime policy is installed via `dblink` to `supabase_admin`. | CLI v3's `postgres` role is not a superuser and cannot own `realtime.messages`. Hosted `postgres` is a superuser and skips that branch. The password is the CLI's published local default, not a project secret. |

## Additive on purpose

These are not built. Nothing in the schema blocks them:

- A new `family_role` value such as `relative`.
- `networks` and `network_families`, plus a space owned by a network.
- A `space_grants` table read by `viewable_space_ids()`.
- A `reactions` table.
- Video on Mux, using the existing `provider` value.
