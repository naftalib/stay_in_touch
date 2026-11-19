-- Hosted repair for the Realtime viewer policy.
-- Connect as the database role postgres through the Supavisor session pooler
-- (user postgres.<project ref>, port 5432). Do not SET ROLE. Do not ALTER TABLE.
-- realtime.messages is owned by supabase_realtime_admin and already has row
-- level security. supautils lets postgres create and drop policies on this
-- table. Membership in supabase_realtime_admin is reserved, so SET ROLE cannot
-- succeed. cli_login_postgres does not receive that policy bypass; this file
-- refuses any session that is not postgres.
-- Safe to run again: the policy is dropped and recreated in one transaction.

begin;

do $guard$
begin
  if session_user <> 'postgres' or current_user <> 'postgres' then
    raise exception
      'realtime policy repair must run as postgres (session pooler user postgres.<project ref>). session_user=%, current_user=%',
      session_user,
      current_user;
  end if;
end
$guard$;

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

commit;
