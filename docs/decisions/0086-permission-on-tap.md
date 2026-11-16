# Ask for notification permission only from a tap

## Context
Browsers block or ignore a permission prompt that was not triggered by a click, and a prompt on load is hostile.

## Options considered
- Call `Notification.requestPermission` when the app opens.
- A card, "Get notified when family posts", with Turn on and Not now.

## Decision
Never prompt on load. Turn on is the only call to `requestPermission`, then `pushManager.subscribe`, then `register_push_subscription`. Not now snoozes the card for 7 days. A denial stays a short explanation and is not asked again. On iPhone the card is shown only in standalone mode; otherwise it links to the install help. Each signed-in open re-registers the current subscription when permission is already granted, unless this device was turned off. That choice is stored on the device and is not set by sign-out, so the next person on a shared tablet can turn notifications on. A subscription whose application server key is not the current VAPID key is replaced. A browser-rotated subscription is not saved while this device is off. Sign-out unregisters the endpoint.

## Consequences
A shared tablet moves the endpoint to the person who is signed in now (ADR 0091).

## Status
Accepted

## Date
2026-11-16
