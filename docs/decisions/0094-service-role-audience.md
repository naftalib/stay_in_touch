# Send-time audience does not use auth.uid()

## Context
`push_group_facts` and `private.unread_total` run as the service role. That session has no `auth.uid()`. `space_viewer_member_ids` only returns members of the caller's families, so every recipient was skipped and the badge was zero. The tests still passed: pgTAP enqueues as the author, `assert_service_role` accepts the `postgres` session, the Deno tests stubbed `eligible: true`, and the browser test treated an empty `sent_payload` as success because it only checked that the message text was absent.

## Options considered
- Pass the recipient into `space_viewer_member_ids`. The service role still has no caller identity, and a signed-in person must not be able to list another family's members.
- Point the enqueue trigger at an unscoped function. Fixture and seed inserts have no JWT, so they would create outbox rows, and the claim tests would depend on insert order.
- Keep `space_viewer_member_ids` caller-scoped. Add `private.space_audience_member_ids` with the same audience rule and no caller filter. Enqueue keeps the viewer function. Send-time and the badge use the audience function. Clients cannot execute it.

## Decision
The third option. A post deleted before send is skipped with `deleted`, after the membership check, so a removed member stays `not_member`. `push_deliveries` records which subscription accepted which rows. The next claim skips a subscription only after it has accepted every row in that claim, so one device's success does not hide a newer post from that device or a failure on another device.

## Consequences
A message inserted with no JWT still enqueues nobody. The app always inserts as the author. The audience rule lives in one function; the viewer function adds the caller check on top.

## Status
Accepted

## Date
2026-11-16
