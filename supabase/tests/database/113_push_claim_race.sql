-- Two sessions claim the same due row. skip locked lets only one take it.
begin;
select set_config('search_path', 'public, extensions', true);

create extension if not exists dblink with schema extensions;

select plan(2);

create temp table push_race (a integer, b integer);

do $$
declare
  conn text := 'host=supabase_db_stay-in-touch port=5432 dbname=' || current_database()
    || ' user=supabase_admin password=postgres';
  a_count integer := -1;
  b_count integer := -1;
begin
  perform extensions.dblink_connect('push_setup', conn);
  perform extensions.dblink_connect('push_a', conn);
  perform extensions.dblink_connect('push_b', conn);

  perform extensions.dblink_exec(
    'push_setup',
    $q$
      create table if not exists public.push_race_saved (
        id uuid primary key,
        next_attempt_at timestamptz
      );
      truncate public.push_race_saved;
      insert into public.push_race_saved (id, next_attempt_at)
      select id, next_attempt_at from public.notification_outbox where status = 'pending';
      update public.notification_outbox
      set next_attempt_at = now() + interval '2 days'
      where status = 'pending';
      delete from public.notification_outbox
      where ref_id = 'b4000000-0000-4000-8000-000000000190'
    $q$
  );
  perform extensions.dblink_exec(
    'push_setup',
    $q$
      insert into public.notification_outbox (
        recipient_user_id, recipient_member_id, family_id, space_id, actor_member_id,
        type, ref_id, status, next_attempt_at
      ) values (
        'a1000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
        'a3000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000003',
        'message.created',
        'b4000000-0000-4000-8000-000000000190',
        'pending',
        now()
      )
    $q$
  );

  perform extensions.dblink_exec('push_a', 'begin');
  select t.n into a_count
  from extensions.dblink(
    'push_a',
    $q$select count(*)::int from public.claim_push_batch(10) c where c.ref_id = 'b4000000-0000-4000-8000-000000000190'$q$
  ) as t(n integer);

  select t.n into b_count
  from extensions.dblink(
    'push_b',
    $q$select count(*)::int from public.claim_push_batch(10) c where c.ref_id = 'b4000000-0000-4000-8000-000000000190'$q$
  ) as t(n integer);

  perform extensions.dblink_exec('push_a', 'rollback');
  perform extensions.dblink_exec(
    'push_setup',
    $q$
      delete from public.notification_outbox
      where ref_id = 'b4000000-0000-4000-8000-000000000190';
      update public.notification_outbox o
      set next_attempt_at = saved.next_attempt_at
      from public.push_race_saved saved
      where o.id = saved.id;
      drop table public.push_race_saved
    $q$
  );

  insert into push_race values (a_count, b_count);

  perform extensions.dblink_disconnect('push_setup');
  perform extensions.dblink_disconnect('push_a');
  perform extensions.dblink_disconnect('push_b');
exception
  when others then
    begin
      perform extensions.dblink_exec(
        'push_setup',
        $q$
          delete from public.notification_outbox
          where ref_id = 'b4000000-0000-4000-8000-000000000190';
          update public.notification_outbox o
          set next_attempt_at = saved.next_attempt_at
          from public.push_race_saved saved
          where o.id = saved.id;
          drop table if exists public.push_race_saved
        $q$
      );
    exception
      when others then
        null;
    end;
    raise;
end;
$$;

select is((select a from push_race), 1, 'the first claim takes the row');
select is((select b from push_race), 0, 'a second claim skips the locked row');

select * from finish();
rollback;
