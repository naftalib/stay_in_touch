# Reserve a photo, then post it with the message

## Context
A photo should not become a thread post until the bytes are stored and checked. Several photos belong on one message.

## Options considered
- The client inserts `media` and `messages` rows itself.
- Reserve a pending row, upload, mark it ready, then attach one to ten ready photos in one RPC.

## Decision
Clients cannot insert `media` directly (`photos are added with reserve_photo_upload`). `reserve_photo_upload` creates a pending photo. `media-finish` checks the stored object and calls `mark_media_ready` or `mark_media_failed`. `post_message_with_photos` attaches 1–10 ready, unattached photos from that member in that space. `message_id` can be set once, from null, and then stays put.

## Consequences
Pending and failed rows are visible only to the uploader. A photo can be attached once. The pending row keeps `provider = r2` until finish sets the real provider, so the window before finish is short and documented.

## Status
Accepted

## Date
2026-11-15
