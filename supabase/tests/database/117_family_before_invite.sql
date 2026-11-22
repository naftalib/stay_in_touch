-- Reset, bootstrap, and accept must lock the family row before the invitation.
-- The body check covers every path. A second session also holds the family
-- row, starts bootstrap_family, and then locks the invitation. That lock
-- succeeds only when bootstrap is waiting on the family and has not taken
-- the invitation yet. The old order deadlocks here.
begin;
select set_config('search_path', 'public, extensions', true);

select plan(8);

create extension if not exists dblink with schema extensions;

create or replace function pg_temp.family_before_invite(p_proc regprocedure)
returns boolean
language plpgsql
as $$
declare
  src text := pg_get_functiondef(p_proc);
  family_at integer := strpos(src, '-- lock-order: family');
  invite_at integer := strpos(src, '-- lock-order: invitation');
begin
  if family_at = 0 or invite_at = 0 or family_at > invite_at then
    return false;
  end if;
  if strpos(substr(src, family_at, invite_at - family_at), 'for update') = 0 then
    return false;
  end if;
  return strpos(substr(src, invite_at), 'for update') > 0;
end;
$$;

select ok(
  pg_temp.family_before_invite('private.reset_unjoined_bootstrap_family(text,text,text)'::regprocedure),
  'reset locks the family before the invitation'
);
select ok(
  pg_temp.family_before_invite('private.bootstrap_family(uuid,text,text,text)'::regprocedure),
  'bootstrap_family locks the family before the invitation'
);
select ok(
  pg_temp.family_before_invite('public.accept_invitation(text)'::regprocedure),
  'accept_invitation locks the family before the invitation'
);
select ok(
  pg_temp.family_before_invite('public.accept_invite(uuid)'::regprocedure),
  'accept_invite locks the family before the invitation'
);
select ok(
  pg_temp.family_before_invite('public.revoke_invitation(uuid)'::regprocedure),
  'revoke_invitation locks the family before the invitation'
);
select ok(
  pg_temp.family_before_invite('public.issue_invitation_token(uuid)'::regprocedure),
  'issue_invitation_token locks the family before the invitation'
);

create temp table lock_order (
  boot_waiting integer,
  boot_invite_held integer,
  boot_hold_error text,
  boot_result text,
  reset_waiting integer,
  reset_invite_held integer,
  reset_hold_error text,
  reset_result text
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
      select id into fid from public.families where name = 'Lock Order Family';
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
      delete from auth.users where email = 'lockorder@fixture.test';
      drop table if exists public.lock_order_log;
    end
    $body$;
  $q$;
  boot_waiting integer := 0;
  boot_invite_held integer := 0;
  boot_hold_error text := '';
  boot_result text := '';
  reset_waiting integer := 0;
  reset_invite_held integer := 0;
  reset_hold_error text := '';
  reset_result text := '';
  waiter integer;
  i integer;
begin
  perform extensions.dblink_connect('ord_setup', conn);
  perform extensions.dblink_connect('ord_hold', conn);
  perform extensions.dblink_connect('ord_boot', conn);
  perform extensions.dblink_connect('ord_reset', conn);

  perform extensions.dblink_exec('ord_setup', cleanup);
  perform extensions.dblink_exec(
    'ord_setup',
    $q$
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        confirmation_token, recovery_token, email_change, email_change_token_new,
        email_change_token_current, reauthentication_token, raw_app_meta_data,
        raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
      ) values (
        '00000000-0000-0000-0000-000000000000',
        'd1000000-0000-4000-8000-0000000000aa',
        'authenticated',
        'authenticated',
        'lockorder@fixture.test',
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
  perform extensions.dblink_exec(
    'ord_setup',
    $q$
      do $body$
      begin
        perform public.bootstrap_family(
          'd1000000-0000-4000-8000-0000000000aa',
          'Lock Order Family',
          'lockorder@fixture.test',
          'Mom'
        );
      end
      $body$
    $q$
  );
  perform extensions.dblink_exec(
    'ord_setup',
    'create table public.lock_order_log (kind text primary key, result text)'
  );

  perform extensions.dblink_exec('ord_hold', 'set application_name = ''lock-order-hold''');
  perform extensions.dblink_exec('ord_hold', 'set lock_timeout = ''15s''');
  perform extensions.dblink_exec('ord_hold', 'set deadlock_timeout = ''200ms''');
  perform extensions.dblink_exec('ord_hold', 'begin');
  perform extensions.dblink_exec(
    'ord_hold',
    $q$
      do $body$
      begin
        perform 1
        from public.families
        where name = 'Lock Order Family'
        for update;
      end
      $body$
    $q$
  );

  perform extensions.dblink_send_query(
    'ord_boot',
    $q$
      do $body$
      begin
        perform set_config('application_name', 'lock-order-boot', false);
        perform set_config('deadlock_timeout', '200ms', true);
        perform set_config('lock_timeout', '8s', true);
        begin
          insert into public.lock_order_log (kind, result)
          select 'bootstrap', b.reused::text
          from public.bootstrap_family(
            'd1000000-0000-4000-8000-0000000000aa',
            'Lock Order Family',
            'lockorder@fixture.test',
            'Mom'
          ) as b;
        exception
          when others then
            insert into public.lock_order_log (kind, result)
            values ('bootstrap', sqlstate || ' ' || sqlerrm);
        end;
      end
      $body$
    $q$
  );

  for i in 1..80 loop
    select a.pid
      into waiter
    from pg_stat_activity a
    where a.application_name = 'lock-order-boot'
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
          and holder.application_name = 'lock-order-hold'
      )
    limit 1;
    exit when waiter is not null;
    perform pg_sleep(0.1);
  end loop;

  if waiter is null then
    select 'no waiter ' || coalesce(string_agg(
      a.application_name || ':' || a.state || ':'
        || coalesce(a.wait_event_type, '') || ':' || coalesce(a.wait_event, ''),
      ','
    ), '')
      into boot_hold_error
    from pg_stat_activity a
    where a.application_name like 'lock-order-%';
  else
    boot_waiting := 1;
    select count(*)::integer
      into boot_invite_held
    from pg_locks l
    join pg_class c on c.oid = l.relation
    where l.pid = waiter
      and l.granted
      and c.relname = 'invitations';
    begin
      perform extensions.dblink_exec(
        'ord_hold',
        $q$
          do $body$
          begin
            perform 1
            from public.invitations
            where family_id = (
              select id from public.families where name = 'Lock Order Family'
            )
            for update;
          end
          $body$
        $q$
      );
    exception
      when others then
        boot_hold_error := sqlstate || ' ' || sqlerrm;
    end;
  end if;

  begin
    perform extensions.dblink_exec('ord_hold', 'commit');
  exception
    when others then
      begin
        perform extensions.dblink_exec('ord_hold', 'rollback');
      exception
        when others then
          boot_hold_error := boot_hold_error || ' rollback ' || sqlerrm;
      end;
  end;

  for i in 1..100 loop
    exit when extensions.dblink_is_busy('ord_boot') = 0;
    perform pg_sleep(0.1);
  end loop;

  begin
    select t.result
      into boot_result
    from extensions.dblink(
      'ord_setup',
      $q$select result from public.lock_order_log where kind = 'bootstrap'$q$
    ) as t(result text);
  exception
    when others then
      boot_result := 'log ' || sqlerrm;
  end;

  begin
    perform *
    from extensions.dblink_get_result('ord_boot', false) as t(done text);
  exception
    when others then null;
  end;


  insert into lock_order (
    boot_waiting, boot_invite_held, boot_hold_error, boot_result,
    reset_waiting, reset_invite_held, reset_hold_error, reset_result
  ) values (
    boot_waiting, boot_invite_held, boot_hold_error, coalesce(boot_result, ''),
    reset_waiting, reset_invite_held, reset_hold_error, coalesce(reset_result, '')
  );

  begin
    perform extensions.dblink_exec('ord_setup', cleanup);
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('ord_reset');
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('ord_boot');
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('ord_hold');
  exception
    when others then null;
  end;
  begin
    perform extensions.dblink_disconnect('ord_setup');
  exception
    when others then null;
  end;
exception
  when others then
    begin
      insert into lock_order (
        boot_waiting, boot_invite_held, boot_hold_error, boot_result,
        reset_waiting, reset_invite_held, reset_hold_error, reset_result
      ) values (
        boot_waiting, boot_invite_held, boot_hold_error, coalesce(boot_result, ''),
        reset_waiting, reset_invite_held, reset_hold_error,
        coalesce(reset_result, '') || ' outer ' || sqlstate || ' ' || sqlerrm
      );
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_exec('ord_hold', 'rollback');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_exec('ord_setup', cleanup);
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('ord_reset');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('ord_boot');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('ord_hold');
    exception
      when others then null;
    end;
    begin
      perform extensions.dblink_disconnect('ord_setup');
    exception
      when others then null;
    end;
end;
$$;

select ok(
  (select boot_waiting = 1 and boot_invite_held = 0 and boot_hold_error = '' from lock_order),
  'bootstrap waits on the family and has not locked the invite: waiting='
    || coalesce((select boot_waiting::text from lock_order), 'null')
    || ' invite_locks='
    || coalesce((select boot_invite_held::text from lock_order), 'null')
    || ' hold='
    || coalesce((select boot_hold_error from lock_order), 'null')
);
select is(
  (select boot_result from lock_order),
  'true',
  'the waiting bootstrap renew commits after the family lock is released'
);
select * from finish();
rollback;
