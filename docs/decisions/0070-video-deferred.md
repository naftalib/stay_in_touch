# Video stays out of this handoff

## Context
The product has a Video tab and a `video` media kind. Video storage was not chosen.

## Options considered
- Store raw MP4 next to photos.
- Hide video until a family member asks for it.

## Decision
The Video tab is not shown. `/f/:familyId/s/:spaceId/video` redirects to messages. New photo RPCs reject a video row. The `video` enum value and the existing seed video row stay, so a later handoff can build on them.

## Consequences
Nobody can upload a video in this build. Reconsidering storage (raw MP4, browser transcode, or Mux) is a follow-up.

## Status
Accepted

## Date
2026-11-15
