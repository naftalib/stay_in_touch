# Admin, grandparent, and member roles

## Context
One person may belong to several families with different roles.

## Options considered
- Role on profile or in JWT.
- Role on `family_members` per family.

## Decision
**Admin** (both parents): see and manage everything in the family. **Grandparent**: see and post in all spaces, manage nothing. **Member** (child): own space plus General only.

## Consequences
Policies and helpers read `family_members`. See roles table in [`docs/architecture.md`](../architecture.md).

## Status
Accepted

## Date
2026-11-12
