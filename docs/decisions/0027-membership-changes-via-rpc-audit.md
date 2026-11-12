# Membership and invites via audited RPCs

## Decision
Clients cannot insert/update memberships, invitations, spaces, or audit log directly. Changes go through security-definer RPCs that write `audit_log`.

## Consequences
Listed RPCs in architecture (`create_invitation`, `remove_member`, etc.).

## Status
Accepted

## Date
2026-11-12
