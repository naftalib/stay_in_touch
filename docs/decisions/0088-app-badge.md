# Badge is the unread total

## Context
The home-screen icon should show how much is unread, without a second counting rule.

## Options considered
- A badge of 1 whenever any push is unread.
- `navigator.setAppBadge` from the family's unread total while the app is open, and `app_badge` on the push from `private.unread_total` across families.

## Decision
Use the same ready-media unread rule as `unread_counts`. Clear the badge at zero. Feature-detect `setAppBadge`. The push badge counts every family for that user.

## Consequences
Browsers without the Badge API show no badge and raise no error. The in-app badge and the icon badge can differ by family while the app is open, because the open app shows the current family.

## Status
Accepted

## Date
2026-11-16
