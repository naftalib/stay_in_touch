# Ask before applying an update

## Context
A waiting service worker can reload the page and wipe a message that has not been sent.

## Options considered
- `registerType: 'autoUpdate'`, which reloads on its own.
- `registerType: 'prompt'` with Update now and Later, held while a draft or a photo upload is in progress.

## Decision
Prompt with "A new version of Stay In Touch is ready." The app never reloads itself. Update now is hidden while the composer has text or a photo is in progress. Update now saves the draft, posts `SKIP_WAITING`, and reloads once when the controller changes. Later dismisses the prompt until the next check. Checks run on open, when the tab becomes visible, and hourly.

## Consequences
There is no `offlineReady` toast. A person can finish a message before taking the update.

## Status
Accepted

## Date
2026-11-16
