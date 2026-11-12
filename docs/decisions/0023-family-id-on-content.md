# family_id on content rows

## Decision
`family_id` is copied onto content rows and checked against the space (composite FK + trigger).

## Consequences
Policies index and filter one column; mismatched families cannot be inserted.

## Status
Accepted

## Date
2026-11-12
