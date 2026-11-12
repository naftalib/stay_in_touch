-- Broadcast a minimal change notice to private Realtime channels named
-- space:<space_id>. The payload has id, space, and operation. It does not
-- include the body, caption, or object keys. Clients refetch under RLS.
-- A member removed after they subscribed keeps the socket until the token
-- refreshes, but they no longer receive the content, and REST will not
-- return it.
-- Soft deletes are updates, so they travel on the same path as edits.
-- Clients do not get an insert policy, so they cannot publish on these topics.
-- The trigger function lives in private so it is not a Data API endpoint.

create or replace function private.broadcast_space_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_space uuid := coalesce(new.space_id, old.space_id);
  msg_new public.messages;
  msg_old public.messages;
  med_new public.media;
  med_old public.media;
begin
  if tg_table_name = 'messages' then
    msg_new := new;
    msg_new.body := null;
    if tg_op = 'UPDATE' then
      msg_old := old;
      msg_old.body := null;
      perform realtime.broadcast_changes(
        'space:' || changed_space::text,
        tg_op,
        tg_op,
        tg_table_name,
        tg_table_schema,
        msg_new,
        msg_old
      );
    else
      perform realtime.broadcast_changes(
        'space:' || changed_space::text,
        tg_op,
        tg_op,
        tg_table_name,
        tg_table_schema,
        msg_new,
        null
      );
    end if;
  else
    med_new := new;
    med_new.caption := null;
    med_new.r2_key := null;
    med_new.thumb_key := null;
    med_new.provider_asset_id := null;
    if tg_op = 'UPDATE' then
      med_old := old;
      med_old.caption := null;
      med_old.r2_key := null;
      med_old.thumb_key := null;
      med_old.provider_asset_id := null;
      perform realtime.broadcast_changes(
        'space:' || changed_space::text,
        tg_op,
        tg_op,
        tg_table_name,
        tg_table_schema,
        med_new,
        med_old
      );
    else
      perform realtime.broadcast_changes(
        'space:' || changed_space::text,
        tg_op,
        tg_op,
        tg_table_name,
        tg_table_schema,
        med_new,
        null
      );
    end if;
  end if;
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
