# Signed view links last one hour

## Context
Photo bytes are private. The thread and the Pics tab need thumbnails and a full-size view.

## Options considered
- Public bucket URLs.
- Signed URLs minted per image on each render.
- Batched signed URLs cached in TanStack Query until shortly before they expire.

## Decision
`media-view-urls` accepts up to 60 ready ids the caller can already read, and returns thumb and full URLs with a 3600 second TTL. The client caches them for 50 minutes and refreshes in the last 10 minutes. URLs are never stored in Postgres.

## Consequences
A removed member's next request returns nothing. A link already in another browser keeps working until it expires. Local observation: the signed GET returned `content-type: image/jpeg` and did not send a `Cache-Control` header, even though the PUT sent `max-age=31536000`.

## Status
Accepted

## Date
2026-11-15
