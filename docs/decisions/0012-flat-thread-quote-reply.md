# Flat WhatsApp-style thread per space

## Context
Each space is one family room for messages and media.

## Options considered
- **Chosen:** One flat thread per space with quote-reply, like WhatsApp.
- **Alternative:** Nested threads under each post, like a forum.

## Decision
One flat message thread per space with optional quote-reply (`reply_to_id` in the same space).

## Consequences
Implemented in schema. No UI yet.

## Status
Accepted

## Date
2026-11-12
