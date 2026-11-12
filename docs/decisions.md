# Decisions

Architecture decisions for Stay In Touch live as numbered ADRs under [`docs/decisions/`](./decisions/). When a decision changes, add or update an ADR and note the change in the [build log](./build-log/).

This index mirrors the old table so existing links to `docs/decisions.md` still land in the right place.

## Product and stack

| Topic | ADR |
|---|---|
| Monorepo layout | [0001](./decisions/0001-monorepo-layout.md) |
| Frontend (Vite, React, PWA) | [0002](./decisions/0002-frontend-stack.md) |
| UI (React Aria, CSS Modules) | [0003](./decisions/0003-ui-components-and-css.md) |
| Hosting (Cloudflare) | [0004](./decisions/0004-hosting-cloudflare.md) |
| Backend (Supabase) | [0005](./decisions/0005-supabase-backend.md) |
| Media (R2, signed URLs) | [0006](./decisions/0006-media-cloudflare-r2.md) |
| Email and push (Resend, Web Push) | [0007](./decisions/0007-email-and-push.md) |
| Future FastAPI (`api/`) | [0008](./decisions/0008-future-fastapi-api-folder.md) |
| Permissions (RLS, Realtime) | [0009](./decisions/0009-permissions-rls-and-realtime.md) |
| Cost path | [0010](./decisions/0010-cost-path.md) |

## Roles, spaces, and content

| Topic | ADR |
|---|---|
| Family roles | [0011](./decisions/0011-family-roles.md) |
| Flat thread and quote-reply | [0012](./decisions/0012-flat-thread-quote-reply.md) |
| Grandparent media in child spaces | [0013](./decisions/0013-grandparent-media-in-child-spaces.md) |
| Child space visibility | [0014](./decisions/0014-child-space-visibility.md) |
| Multi-family membership | [0015](./decisions/0015-multi-family-membership.md) |
| No grandparent-owned space | [0016](./decisions/0016-no-grandparent-space.md) |
| Soft delete and moderation | [0017](./decisions/0017-content-delete-and-moderation.md) |
| Child `+alias` accounts | [0018](./decisions/0018-child-plus-alias-accounts.md) |
| Product decisions from PR #1 review | [0019](./decisions/0019-product-decisions-from-review.md) |
| Agent workflow (builder + reviewer) | [0020](./decisions/0020-agent-workflow.md) |

## Database and repo implementation

| Topic | ADR |
|---|---|
| Deleted content visibility | [0021](./decisions/0021-deleted-content-visibility.md) |
| Invite-only signup | [0022](./decisions/0022-invite-only-signup.md) |
| `family_id` on content | [0023](./decisions/0023-family-id-on-content.md) |
| Media object key shape | [0024](./decisions/0024-media-object-key-shape.md) |
| `private` schema helpers | [0025](./decisions/0025-private-schema-helpers.md) |
| `authenticated` executes helpers | [0026](./decisions/0026-authenticated-execute-helpers.md) |
| Membership changes via RPC + audit | [0027](./decisions/0027-membership-changes-via-rpc-audit.md) |
| Read RPCs security invoker | [0028](./decisions/0028-read-rpcs-security-invoker.md) |
| Broadcast trigger in `private` | [0029](./decisions/0029-realtime-broadcast-trigger-private.md) |
| Plain SQL migrations | [0030](./decisions/0030-plain-sql-migrations.md) |
| pnpm and oxlint | [0031](./decisions/0031-pnpm-and-oxlint.md) |
| Local seed password | [0032](./decisions/0032-local-seed-password.md) |
| Local Realtime policy (`dblink`) | [0033](./decisions/0033-local-realtime-policy-dblink.md) |

## First web screens (handoff 03)

| Topic | ADR |
|---|---|
| Routing (React Router 8 declarative) | [0035](./decisions/0035-routing.md) |
| Server state (TanStack Query) | [0036](./decisions/0036-server-state-tanstack-query.md) |
| Thread list (no virtualization) | [0037](./decisions/0037-thread-list-no-virtualization.md) |
| Forms (React Aria) | [0038](./decisions/0038-forms-react-aria.md) |
| Frontend testing | [0039](./decisions/0039-frontend-testing.md) |
| Design tokens (CSS variables) | [0040](./decisions/0040-design-tokens-css.md) |
| Generated DB types | [0041](./decisions/0041-generated-db-types.md) |
| Deleted message placeholder | [0042](./decisions/0042-deleted-message-placeholder.md) |
| Media hidden with deleted parent | [0043](./decisions/0043-media-hidden-with-deleted-message.md) |
| Magic link with code | [0044](./decisions/0044-magic-link-with-code.md) |
| Realtime subscription scope | [0045](./decisions/0045-realtime-subscription-scope.md) |
| Child nav sibling labels | [0046](./decisions/0046-child-nav-sibling-labels.md) |

## Future additions

| Topic | ADR |
|---|---|
| Additive schema ideas (relative, networks, reactions, Mux) | [0034](./decisions/0034-future-additive-schema.md) |

Deeper enforcement detail stays in [`docs/architecture.md`](./architecture.md) and hosted checklists in [`docs/hosted-settings.md`](./hosted-settings.md) — link rather than duplicate.
