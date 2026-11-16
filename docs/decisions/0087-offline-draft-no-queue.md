# Keep the draft, do not send offline

## Context
Grandparents lose the network. Sending from a queue would need conflict handling we do not have.

## Options considered
- Background Sync that posts when the network returns.
- Keep the composer, save the text on this device, and disable Send.

## Decision
The existing offline banner stays. The composer stays on screen. Send is disabled with "You're offline. Your message is saved and you can send it when you're back online." The draft is stored per user and space in `localStorage`, restored on return, and cleared when the send succeeds and when anyone signs out. Photos are not stored. A reload during an upload says the photos need to be chosen again.

## Consequences
There is no offline outbox. A message that was not sent is still only on this device until the network is back and the person presses Send.

## Status
Accepted

## Date
2026-11-16
