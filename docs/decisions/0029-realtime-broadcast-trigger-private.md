# Broadcast trigger function in private

## Decision
The function that calls `realtime.broadcast_changes()` lives in `private`, not `public`.

## Consequences
A public function would appear as a Data API endpoint.

## Status
Accepted

## Date
2026-11-12
