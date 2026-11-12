# Child navigation uses label-only sibling names

## Context

A child should see a sibling's name in the side nav and must not receive that sibling's space id. The first screen pass loaded every `family_members` row the family select policy returns and treated the first row as the signed-in person. That made a child's client role and member id match a parent, so the nav never asked for sibling labels and action menus used the wrong role. Row level security still hid the spaces.

## Options considered

- Keep reading `family_members` in the client and filter to `auth.uid()` plus other children. The select policy returns roles and user ids for the whole family, which is more than the nav needs.
- Add a security-invoker RPC that returns only the other children's labels, and scope the membership query to the signed-in user.

## Decision

The side nav loads sibling names from `nav_child_sibling_labels`. The membership query filters to the current session user. UI role checks sit on top of RLS; they do not replace it.

## Consequences

A child sees sibling names as plain text, with no space id in the DOM. Parents and grandparents get no rows from that RPC. Playwright runs one test at a time because the suite shares one local database.

## Status

Accepted

## Date

2026-11-12
