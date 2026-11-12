-- Install the viewer select policy on realtime.messages.
--
-- The table is owned by supabase_realtime_admin and already has RLS enabled.
-- Hosted postgres is not a superuser. The policy can be created directly only
-- when the migration role can assume supabase_realtime_admin.
-- Local CLI v3 cannot. This migration asks the local superuser, over the
-- database container network, using the CLI's published local password, and
-- then drops dblink so that path is not left for anon or authenticated.
-- The password is not a project secret. A hosted database has no container
-- by this name, so that branch fails closed instead of installing dblink.

do $install$
declare
  drop_sql text := 'drop policy if exists "viewers can receive space broadcasts" on realtime.messages';
  create_sql text := $policy$
    create policy "viewers can receive space broadcasts"
      on realtime.messages
      for select
      to authenticated
      using (
        realtime.messages.extension = 'broadcast'
        and realtime.messages.topic = realtime.topic()
        and private.topic_space_id() is not null
        and private.topic_space_id() in (select private.viewable_space_ids())
      )
  $policy$;
begin
  if pg_has_role(current_user, 'supabase_realtime_admin', 'member')
     or exists (select 1 from pg_roles where rolname = current_user and rolsuper) then
    execute 'set local role supabase_realtime_admin';
    execute drop_sql;
    execute create_sql;
    return;
  end if;

  -- Created and dropped in this transaction, so no other session can use it.
  -- dblink_connect_u stays executable only by its owner. postgres cannot
  -- revoke the public grant on the other functions (supabase_admin granted
  -- it), which is why the extension must not remain.
  execute 'create extension if not exists dblink with schema extensions';

  perform extensions.dblink_connect(
    'sit_realtime_policy',
    'host=supabase_db_stay-in-touch port=5432 dbname=' || current_database()
      || ' user=supabase_admin password=postgres'
  );
  perform extensions.dblink_exec(
    'sit_realtime_policy',
    'set role supabase_realtime_admin'
  );
  perform extensions.dblink_exec('sit_realtime_policy', drop_sql);
  perform extensions.dblink_exec('sit_realtime_policy', create_sql);
  perform extensions.dblink_disconnect('sit_realtime_policy');
  execute 'drop extension if exists dblink';
exception
  when others then
    begin
      perform extensions.dblink_disconnect('sit_realtime_policy');
    exception
      when others then
        null;
    end;
    begin
      execute 'drop extension if exists dblink';
    exception
      when others then
        null;
    end;
    raise exception
      'cannot install the realtime viewer policy. The migration role must be able to assume supabase_realtime_admin, or this must be the local CLI database. %',
      sqlerrm;
end
$install$;
