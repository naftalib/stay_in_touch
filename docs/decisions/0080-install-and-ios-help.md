# Install card and iPhone Home Screen help

## Context
Chromium can install from `beforeinstallprompt`. iPhone and iPad Safari cannot, and notifications there work only from the Home Screen.

## Options considered
- Rely on the browser's default install UI.
- A dismissible install card, plus a three-step Add to Home Screen page.

## Decision
Show an Install / Not now card once per device when `beforeinstallprompt` fires, and again from notification settings. iPhone and iPad Safari get `/install`: Share, Add to Home Screen, then open the icon, including why notifications need that icon. The card stays hidden when the app is already installed (`display-mode: standalone` or `navigator.standalone`).

## Consequences
Install help is the path tested on WebKit and iPhone 13 emulation. A real device install is a go-live check (ADR 0089).

## Status
Accepted

## Date
2026-11-16
