# Hide media when parent message is not visible

## Context
Attachments should follow message visibility without duplicate soft-delete state.

## Options considered
- Tighten `media_select` with an `EXISTS` check on `messages`.
- Cascade soft-delete on messages to media.

## Decision
**Option A:** `media_select` requires parent message visibility via RLS on `messages`.

## Consequences
Admin restore of a message restores media visibility automatically.

## Status
Accepted

## Date
2026-11-12
