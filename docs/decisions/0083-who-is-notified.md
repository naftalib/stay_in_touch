# Who is notified, and quiet hours not chosen

## Context
A post should reach the people who can already see that space, and nobody else. The family is small enough that a clock window was discussed and set aside.

## Options considered
- Quiet hours, dropping or delaying pushes overnight.
- Notify every active viewer except the author, someone with default `push = false`, someone who muted that space, or someone whose `muted_until` is still in the future. Default is on. Pause and per-space mute are the controls.

## Decision
Use `private.space_viewer_member_ids` for the space, then apply those exclusions. Quiet hours were considered and not chosen. Pause (8 hours, or until 07:00 Asia/Jerusalem, at most 7 days) and mute cover the need. Re-check the same rules at send time. Only a new post enqueues a push. Reactions, edits, deletes, and invites do not.

## Consequences
There is no quiet-hours column. A pause set after enqueue is skipped when the sender runs.

## Status
Accepted

## Date
2026-11-16
