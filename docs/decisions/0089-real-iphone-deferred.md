# Real iPhone push is a go-live check

## Context
iOS delivers web push only to a Home Screen web app, and only the real device can prove that path.

## Options considered
- Block this handoff on a physical iPhone.
- Cover install help and offline with Playwright WebKit and iPhone 13 emulation, and test a real iPhone when the hosted project exists.

## Decision
Defer the real iPhone, and an Android install, to go-live. This handoff ships the manifest, the worker, and the emulated install help.

## Consequences
A hosted VAPID key and a Home Screen install are still required before anyone relies on iPhone notifications.

## Status
Accepted

## Date
2026-11-16
