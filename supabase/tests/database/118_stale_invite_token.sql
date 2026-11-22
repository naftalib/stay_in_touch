-- accept_invitation peeks by token_hash, then waits for the family lock.
-- A resend can rotate the hash in that gap. The locked row must be checked
-- again. One transaction never rotates the hash between those two reads, so
-- the re-check is also forced by a second session.
begin;
select set_config('search_path', 'public, extensions', true);

select plan(4);

select ok(
  strpos(
    pg_get_functiondef('public.accept_invitation(text)'::regprocedure),
    '-- lock-order: invitation'
  ) < strpos(
    pg_get_functiondef('public.accept_invitation(text)'::regprocedure),
    'invite.token_hash is distinct from private.invitation_token_hash'
  ),
  'accept_invitation re-checks the token hash after it locks the invitation'
);

create extension if not exists dblink with schema extensions;

create temp table stale_out (
  result text,
  members integer,
  pending integer
);

do $$
declare
  conn text := 'host=supabase_db_stay-in-touch port=5432 dbname=' || current_database()
    || ' user=supabase_admin password=postgres';
  cleanup text := $q$
    do $body$
    declare
      fid uuid;
    begin
      select id into fid from public.families where name = 'Stale Token Family';
      if fid is not null then
        delete from public.audit_log where family_id = fid;
        delete from public.messages where family_id = fid;
        delete from public.media where family_id = fid;
        delete from public.notification_outbox where family_id = fid;
        delete from public.invitations where family_id = fid;
        delete from public.spaces where family_id = fid;
        delete from public.family_members where family_id = fid;
        delete from public.families where id = fid;
      end if;
      delete from auth.users where email = 'staloken@fixture.test';
      drop table if exists public.stale_token_log;
    end
    $body$;
  $q$;
  raw_token text := '';
  fam uuid;
  waiter integer;
  accept_result text := '';
  members integer := 0;
  pending integer := 0;
  i integer;
begin
  perform extensions.dblink_connect('stale_setup', conn);
  perform extensions.dblink_connect('stale_hold', conn);
  perform extensions.dblink_connect('stale_accept', conn);
  perform extensions.dblink_exec('stale_setup', cleanup);
  perform extensions.dblink_exec(
    'stale_setup',
    $q$
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, reauthentication_token, raw_app_meta_data,
        raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000',
        'd2000000-0000-4000-8000-0000000000b1',
        'authenticated',
        'authenticated',
        'staloken@fixture.test',
        extensions.crypt('fixture-only', extensions.gen_salt('bf')),
        pg_catalog.now(),
        '', '', '', '', '', '',
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Mom"}'::jsonb,
        pg_catalog.now(),
        pg_catalog.now(),
        false,
        false
      )
    $q$
  );
  select t.token
    into raw_token
  from extensions.dblink(
    'stale_setup',
    $q$
      select b.token
      from public.bootstrap_family(
        'd2000000-0000-4000-8000-0000000000b1',
        'Stale Token Family',
        'staloken@fixture.test',
        'Mom'
      ) as b
    $q$
  ) as t(token text);
  select t.id
    into fam
  from extensions.dblink(
    'stale_setup',
    $q$select id from public.families where name = 'Stale Token Family'$q$
  ) as t(id uuid);
  perform extensions.dblink_exec(
    'stale_setup',
    'create table public.stale_token_log (result text)'
  );

  perform extensions.dblink_exec('stale_hold', 'set application_name = ''stale-hold''');
  perform extensions.dblink_exec('stale_hold', 'set lock_timeout = ''15s''');
  perform extensions.dblink_exec('stale_accept', 'set application_name = ''stale-accept''');
  perform extensions.dblink_exec('stale_hold', 'begin');
  perform extensions.dblink_exec(
    'stale_hold',
    format(
      $q$do $body$ begin perform 1 from public.families where id = %L for update; end $body$$q$,
      fam
    )
  );

  perform extensions.dblink_send_query(
    'stale_accept',
    format(
      $q$
        do $body$
        begin
          perform set_config('application_name', 'stale-accept', false);
          perform set_config('lock_timeout', '20s', true);
          perform set_config('deadlock_timeout', '200ms', true);
          perform set_config('request.jwt.claim.sub', %L, true);
          perform set_config('request.jwt.claim.role', 'authenticated', true);
          perform set_config(
            'request.jwt.claims',
            json_build_object('sub', %L, 'role', 'authenticated')::text,
            true
          );
          execute 'set local role authenticated';
          begin
            perform public.accept_invitation(%L);
            execute 'reset role';
            insert into public.stale_token_log (result) values ('accepted');
          exception
            when others then
              execute 'reset role';
              insert into public.stale_token_log (result)
              values (sqlstate || ' ' || sqlerrm);
          end;
        end
        $body$
      $q$,
      'd2000000-0000-4000-8000-0000000000b1',
      'd2000000-0000-4000-8000-0000000000b1',
      raw_token
    )
  );

  for i in 1..80 loop
    select a.pid
      into waiter
    from pg_stat_activity a
    where a.application_name = 'stale-accept'
      and a.state = 'active'
      and exists (
        select 1
        from pg_locks waiter_lock
        join pg_locks holder_lock
          on holder_lock.locktype = 'transactionid'
         and holder_lock.transactionid = waiter_lock.transactionid
         and holder_lock.granted
         and not waiter_lock.granted
        join pg_stat_activity holder on holder.pid = holder_lock.pid
        where waiter_lock.pid = a.pid
          and holder.application_name = 'stale-hold'
      )
    limit 1;
    exit when waiter is not null;
    perform pg_sleep(0.1);
  end loop;

  if waiter is null then
    select 'no waiter ' || coalesce(string_agg(
      coalesce(nullif(a.application_name, ''), 'unnamed') || ':' || a.state || ':'
        || coalesce(a.wait_event_type, '') || ':' || coalesce(a.wait_event, ''),
      ' || '
    ), '')
      into accept_result
    from pg_stat_activity a
    where a.application_name like 'stale-%';
  else
    perform extensions.dblink_exec(
      'stale_hold',
      format(
        $q$
          update public.invitations
          set token_hash = private.invitation_token_hash('rotated-stale-token')
          where family_id = %L
        $q$,
        fam
      )
    );
  end if;

  begin
    perform extensions.dblink_exec('stale_hold', 'commit');
  exception
    when others then
      begin
        perform extensions.dblink_exec('stale_hold', 'rollback');
      exception
        when others then null;
      end;
  end;

  for i in 1..100 loop
    exit when extensions.dblink_is_busy('stale_accept') = 0;
    perform pg_sleep(0.1);
  end loop;

  if waiter is not null then
    begin
      select t.result
        into accept_result
      from extensions.dblink(
        'stale_setup',
        $q$select result from public.stale_token_log limit 1$q$
      ) as t(result text);
    exception
      when others then
        accept_result := 'log ' || sqlerrm;
    end;
  end if;

  select t.n
    into members
  from extensions.dblink(
    'stale_setup',
    $q$
      select count(*)::integer
      from public.family_members fm
      join public.families f on f.id = fm.family_id
      where f.name = 'Stale Token Family'
    $q$
  ) as t(n integer);
  select t.n
    into pending
  from extensions.dblink(
    'stale_setup',
    $q$
      select count(*)::integer
      from public.invitations i
      join public.families f on f.id = i.family_id
      where f.name = 'Stale Token Family'
        and i.status = 'pending'
    $q$
  ) as t(n integer);

  insert into stale_out (result, members, pending)
  values (coalesce(accept_result, ''), coalesce(members, 0), coalesce(pending, 0));

  begin
    perform extensions.dblink_exec('stale_setup', cleanup);
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('stale_accept');
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('stale_hold');
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('stale_setup');
  exception
    when others then null;
  end;
exception
  when others then
    begin
      insert into stale_out (result, members, pending)
      values ('outer ' || sqlstate || ' ' || sqlerrm, 0, 0);
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_exec('stale_hold', 'rollback');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_exec('stale_setup', cleanup);
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('stale_accept');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('stale_hold');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('stale_setup');
    exception
      when others then null;
    end;
end;
$$;

select is(
  (select result from stale_out),
  '42501 invitation token is no longer valid',
  'an old invite link fails when the hash rotates while accept waits: '
    || coalesce((select result from stale_out), 'null')
);
select is(
  (select members from stale_out),
  0,
  'the stale accept does not create a member'
);
select is(
  (select pending from stale_out),
  1,
  'the invitation stays pending after the stale accept'
);

select * from finish();
rollback;
