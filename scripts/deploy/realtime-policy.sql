-- Hosted-safe install of the Realtime viewer policy.
-- Run as the hosted postgres role. Do not SET ROLE. Do not ALTER TABLE.
-- realtime.messages already has row level security. supautils allows
-- postgres to create and drop policies on this table.
drop policy if exists "viewers can receive space broadcasts" on realtime.messages;

create policy "viewers can receive space broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.messages.topic = realtime.topic()
    and private.topic_space_id() is not null
    and private.topic_space_id() in (select private.viewable_space_ids())
  );
