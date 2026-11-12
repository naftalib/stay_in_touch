-- Broadcast database changes to private Realtime channels named space:<space_id>.
-- Soft deletes are updates, so they travel on the same path as edits.
-- Clients do not get an insert policy, so they cannot publish on these topics.
-- The trigger function lives in private so it is not a Data API endpoint.
-- Docs: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
-- and https://supabase.com/docs/guides/realtime/authorization

create or replace function private.broadcast_space_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_space uuid := coalesce(new.space_id, old.space_id);
begin
  perform realtime.broadcast_changes(
    'space:' || changed_space::text,
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

revoke all on function private.broadcast_space_change() from public, anon, authenticated;

create trigger messages_broadcast
  after insert or update on public.messages
  for each row
  execute function private.broadcast_space_change();

create trigger media_broadcast
  after insert or update on public.media
  for each row
  execute function private.broadcast_space_change();

-- realtime.messages is owned by supabase_realtime_admin. The policy expression
-- is checked as that role, which needs to see the helper functions.
grant usage on schema private to supabase_realtime_admin;
grant execute on function private.topic_space_id() to supabase_realtime_admin;
grant execute on function private.viewable_space_ids() to supabase_realtime_admin;

-- The select policy is installed in the next migration. It has to run after
-- these grants commit: local CLI v3 is not a superuser, so the policy is
-- created on a second connection that cannot see uncommitted grants.
