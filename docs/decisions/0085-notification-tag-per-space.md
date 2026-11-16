# One notification tag per space

## Context
Several posts in the same space should not stack a pile of banners.

## Options considered
- A new notification for every post.
- `tag = space:<space_id>` with `renotify: true`, so the newer banner replaces the older one and still alerts.

## Decision
Group on the device by space id. The server groups the same way: one payload per recipient and space.

## Consequences
A person sees the latest summary for that space, not one banner per post.

## Status
Accepted

## Date
2026-11-16
