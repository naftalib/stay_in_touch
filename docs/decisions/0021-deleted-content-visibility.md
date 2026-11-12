# Who can read soft-deleted posts

## Context
Postgres checks the updated row against SELECT policy when a user soft-deletes their own post.

## Decision
Soft-deleted rows stay in the table. Non-author members cannot read them. Author and family admins can. Broadcasts omit body/caption/keys.

## Consequences
Part of [0019](./0019-product-decisions-from-review.md). Removed members on an open socket may still get minimal notices until JWT refresh.

## Status
Accepted

## Date
2026-11-12
