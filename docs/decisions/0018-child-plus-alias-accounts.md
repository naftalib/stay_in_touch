# Parent-managed +alias logins

## Context
Young children need accounts the parent controls.

## Options considered
- **Chosen:** Parent-managed `+alias` addresses, each a separate auth user.
- **Alternative:** Child's own email only.

## Decision
Each child's `+alias` email is its own auth user. The parent signs in **as the child** to accept that child's invitation (`accept_invite` matches confirmed email).

## Consequences
Covered by tests and seed (`mom+noa@example.test`, etc.).

## Status
Accepted

## Date
2026-11-12
