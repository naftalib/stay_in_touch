# No space owned by grandparents

## Context
Grandparents visit all rooms but are not a separate "household" within the app.

## Decision
No grandparent-owned space for now. Grandparents have role `grandparent` and no `spaces` row.

## Consequences
Guards in RPCs prevent granting a space to a grandparent or making a space owner a grandparent (with a known edge case noted in build log follow-ups).

## Status
Accepted

## Date
2026-11-12
