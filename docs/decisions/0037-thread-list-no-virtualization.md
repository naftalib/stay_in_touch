# Message list without virtualization

## Context
Grandparent prototype users need screen-reader-friendly DOM and zoom.

## Options considered
- Plain list with IntersectionObserver pagination.
- TanStack Virtual chat mode.
- react-virtuoso / commercial message list.

## Decision
**No virtualization** for handoff 03; sentinel at top for older pages and manual scroll anchoring.

## Consequences
Upgrade path documented if threads exceed ~1,000 loaded rows.

## Status
Accepted

## Date
2026-11-12
