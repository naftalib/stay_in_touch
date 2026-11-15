# A blank message is allowed only while a photo is attached

## Context
The old check rejected every blank message body. A photo-only post has no text.

## Options considered
- Require a caption as the message body.
- Allow a blank body when at least one photo is attached, and reject a blank body with no photo.

## Decision
`messages.body` may be empty. A client insert of a blank body fails immediately with `23514`. `post_message_with_photos` may insert a blank body because it attaches photos in the same transaction. A deferred constraint confirms the message still has text or a live photo at commit. When the last photo on a blank message is soft-deleted, the message is soft-deleted too, so the thread shows "Message deleted" instead of an empty bubble.

## Consequences
Photo-only posts work. Deleting the last photo of a blank post removes the post. A message that also has text stays when its photos are deleted.

## Status
Accepted

## Date
2026-11-15
