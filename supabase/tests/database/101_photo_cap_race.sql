-- Two committed sessions race a reservation that would cross the 800 MB cap.
-- The near-cap row is committed on another connection so both sessions see it.
-- This file's transaction never calls reserve_photo_upload, so it does not
-- hold advisory lock 83427601.
begin;
select set_config('search_path', 'public, extensions', true);

select plan(3);

create extension if not exists dblink with schema extensions;

create temp table cap_race (
  waiting integer,
  pending_count integer,
  second_error text
);

do $$
declare
  conn text := 'host=supabase_db_stay-in-touch port=5432 dbname=' || current_database()
    || ' user=supabase_admin password=postgres';
  used bigint;
  cap bigint;
  filler bigint;
  waiting integer := 0;
  i integer;
  pending integer;
  second_error text := '';
begin
  perform extensions.dblink_connect('cap_setup', conn);
  perform extensions.dblink_connect('cap_a', conn);
  perform extensions.dblink_connect('cap_b', conn);

  perform extensions.dblink_exec('cap_setup', 'drop table if exists public.cap_race_log');
  perform extensions.dblink_exec('cap_setup', 'create table public.cap_race_log (result text)');
  perform extensions.dblink_exec(
    'cap_setup',
    $q$delete from public.media where id = 'a5000000-0000-4000-8000-0000000000c1' or caption in ('cap-race', 'cap-race-filler')$q$
  );

  select t.used into used
  from extensions.dblink(
    'cap_setup',
    $q$
      select coalesce(sum(
        case
          when status = 'ready' then coalesce(size_bytes, 0) + coalesce(expected_thumb_bytes, 0)
          when status = 'pending' then coalesce(expected_bytes, 0) + coalesce(expected_thumb_bytes, 0)
          else 0
        end
      ), 0)::bigint
      from public.media
    $q$
  ) as t(used bigint);

  select photo_storage_cap_bytes into cap from private.app_limits;
  filler := cap - used - 1500;
  if filler < 1 then
    raise exception 'photo cap race has no room under the cap (used % of %)', used, cap;
  end if;

  perform extensions.dblink_exec(
    'cap_setup',
    format(
      $q$
        insert into public.media (
          id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
          content_type, status, provider, created_by, size_bytes, expected_thumb_bytes,
          width, height, caption
        ) values (
          'a5000000-0000-4000-8000-0000000000c1',
          'a3000000-0000-4000-8000-000000000004',
          'a0000000-0000-4000-8000-000000000001',
          'a2000000-0000-4000-8000-000000000003',
          'photo',
          'f/a0000000-0000-4000-8000-000000000001/s/a3000000-0000-4000-8000-000000000004/a5000000-0000-4000-8000-0000000000c1/original.jpg',
          'f/a0000000-0000-4000-8000-000000000001/s/a3000000-0000-4000-8000-000000000004/a5000000-0000-4000-8000-0000000000c1/thumb.jpg',
          'image/jpeg', 'ready', 'supabase',
          'a1000000-0000-4000-8000-000000000003',
          %s, null, 100, 100, 'cap-race-filler'
        )
      $q$,
      filler
    )
  );

  perform extensions.dblink_exec('cap_a', 'begin');
  perform extensions.dblink_exec(
    'cap_a',
    $q$
      do $body$
      begin
        perform set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
        perform set_config('request.jwt.claim.role', 'authenticated', true);
        perform set_config(
          'request.jwt.claims',
          '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',
          true
        );
        execute 'set local role authenticated';
        perform public.reserve_photo_upload(
          'a3000000-0000-4000-8000-000000000004', 900, 400, 100, 80, 'cap-race'
        );
      end
      $body$
    $q$
  );

  perform extensions.dblink_send_query(
    'cap_b',
    $q$
      begin;
      do $body$
      begin
        perform set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
        perform set_config('request.jwt.claim.role', 'authenticated', true);
        perform set_config(
          'request.jwt.claims',
          '{"sub":"a1000000-0000-4000-8000-000000000003","role":"authenticated"}',
          true
        );
        execute 'set local role authenticated';
        begin
          perform public.reserve_photo_upload(
            'a3000000-0000-4000-8000-000000000004', 900, 400, 100, 80, 'cap-race'
          );
          execute 'reset role';
          insert into public.cap_race_log (result) values ('committed');
        exception
          when others then
            execute 'reset role';
            insert into public.cap_race_log (result) values (sqlstate || ' ' || sqlerrm);
        end;
      end
      $body$;
      commit;
    $q$
  );

  for i in 1..80 loop
    select count(*)::integer into waiting
    from pg_locks
    where locktype = 'advisory'
      and objid = 83427601
      and not granted;
    exit when waiting > 0;
    perform pg_sleep(0.1);
  end loop;

  perform extensions.dblink_exec('cap_a', 'commit');

  for i in 1..50 loop
    exit when extensions.dblink_is_busy('cap_b') = 0;
    perform pg_sleep(0.1);
  end loop;

  select t.result into second_error
  from extensions.dblink('cap_setup', $q$select result from public.cap_race_log limit 1$q$) as t(result text);

  select t.n into pending
  from extensions.dblink(
    'cap_setup',
    $q$select count(*)::integer from public.media where caption = 'cap-race' and status = 'pending'$q$
  ) as t(n integer);

  insert into cap_race (waiting, pending_count, second_error)
  values (waiting, pending, coalesce(second_error, ''));

  perform extensions.dblink_exec(
    'cap_setup',
    $q$delete from public.media where id = 'a5000000-0000-4000-8000-0000000000c1' or caption in ('cap-race', 'cap-race-filler')$q$
  );
  perform extensions.dblink_exec('cap_setup', 'drop table if exists public.cap_race_log');
  perform extensions.dblink_disconnect('cap_b');
  perform extensions.dblink_disconnect('cap_a');
  perform extensions.dblink_disconnect('cap_setup');
exception
  when others then
    begin
      perform extensions.dblink_exec(
        'cap_setup',
        $q$delete from public.media where id = 'a5000000-0000-4000-8000-0000000000c1' or caption in ('cap-race', 'cap-race-filler')$q$
      );
      perform extensions.dblink_exec('cap_setup', 'drop table if exists public.cap_race_log');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('cap_b');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('cap_a');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('cap_setup');
    exception
      when others then null;
    end;
    raise;
end;
$$;

select cmp_ok(
  (select waiting from cap_race),
  '>',
  0,
  'the second reservation waits on the app-wide advisory lock'
);

select is(
  (select pending_count from cap_race),
  1,
  'only one of the two racing reservations is stored'
);

select ok(
  (select second_error from cap_race) like '22023%',
  'the reservation that would cross 800 MB fails: ' || coalesce((select second_error from cap_race), 'no error')
);

select * from finish();
rollback;
