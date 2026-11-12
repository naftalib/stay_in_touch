-- Install the viewer select policy on realtime.messages.
--
-- The table is owned by supabase_realtime_admin and already has RLS enabled.
-- Hosted projects run migrations as a superuser and take the first branch.
-- Local CLI v3 runs them as a non-superuser `postgres` role, and membership
-- in supabase_realtime_admin is reserved for superusers, so the second branch
-- asks the local superuser to install the policy. The container name matches
-- project_id and the password is the CLI's published local default. This is
-- not a project secret, and the hostname does not exist on a hosted database.

create extension if not exists dblink with schema extensions;

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
exception
  when others then
    begin
      perform extensions.dblink_disconnect('sit_realtime_policy');
    exception
      when others then
        null;
    end;
    raise;
end
$install$;
