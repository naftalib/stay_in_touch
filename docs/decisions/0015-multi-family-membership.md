# One person, several families

## Context
Relatives may eventually join multiple family groups.

## Options considered
- **Chosen:** Membership in several families (multiple `family_members` rows).
- **Alternative:** One family per user only.

## Decision
The data model allows one auth user in multiple families (separate `family_members` rows).

## Consequences
No role on `profiles`. JWT cannot encode a single family role.

## Status
Accepted

## Date
2026-11-12
