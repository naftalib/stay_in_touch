-- Who is notified when a message is posted, and that the trigger cannot
-- fail the insert. Fixtures use @fixture.test and roll back.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(28);

select test.login('grandma@fixture.test');
set local role authenticated;

select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000110',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'marker-zz-not-in-push',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'a post succeeds when vault has no push secret'
);

select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000111',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'marker-zz-general',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'a general post succeeds'
);

reset role;

select results_eq(
  $$
    select u.email::text
    from public.notification_outbox o
    join auth.users u on u.id = o.recipient_user_id
    where o.ref_id = 'b4000000-0000-4000-8000-000000000110'
    order by 1
  $$,
  $$values ('dad@fixture.test'), ('grandpa@fixture.test'), ('mom@fixture.test'), ('noa@fixture.test')$$,
  'grandma in noa space notifies mom, dad, grandpa, and noa'
);

select is(
  (
    select count(*)::int
    from public.notification_outbox
    where ref_id = 'b4000000-0000-4000-8000-000000000110'
      and recipient_user_id in (
        'b1000000-0000-4000-8000-000000000003',
        'b1000000-0000-4000-8000-000000000006',
        'b1000000-0000-4000-8000-000000000007'
      )
  ),
  0,
  'the author, ari, and a removed member are not notified'
);

select results_eq(
  $$
    select u.email::text
    from public.notification_outbox o
    join auth.users u on u.id = o.recipient_user_id
    where o.ref_id = 'b4000000-0000-4000-8000-000000000111'
    order by 1
  $$,
  $$values
    ('ari@fixture.test'),
    ('dad@fixture.test'),
    ('grandpa@fixture.test'),
    ('mom@fixture.test'),
    ('noa@fixture.test')
  $$,
  'a general post notifies everyone except the author'
);

select ok(
  not exists (
    select 1
    from public.notification_outbox
    where coalesce(sent_payload::text, '') like '%marker-zz%'
       or coalesce(skip_reason, '') like '%marker-zz%'
       or type like '%marker-zz%'
  ),
  'outbox rows do not store message text'
);

select is(
  (select count(*)::int from public.notification_outbox where ref_id = 'b4000000-0000-4000-8000-000000000110'),
  4,
  'one row per recipient'
);

do $$
begin
  perform private.enqueue_message_notifications('b4000000-0000-4000-8000-000000000110');
end;
$$;

select is(
  (select count(*)::int from public.notification_outbox where ref_id = 'b4000000-0000-4000-8000-000000000110'),
  4,
  'a second enqueue adds nothing'
);

select test.login('mom@fixture.test');
set local role authenticated;
select lives_ok(
  $$select public.set_space_muted('b3000000-0000-4000-8000-000000000004', true)$$,
  'mom mutes noa space'
);
select test.login('grandma@fixture.test');
select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000112',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'after mute',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'a post still succeeds when a viewer is muted'
);
reset role;

select is(
  (
    select count(*)::int
    from public.notification_outbox
    where ref_id = 'b4000000-0000-4000-8000-000000000112'
      and recipient_member_id = 'b2000000-0000-4000-8000-000000000001'
  ),
  0,
  'a muted space creates no row'
);

select test.login('dad@fixture.test');
set local role authenticated;
select lives_ok(
  $$select public.set_notifications_enabled('b0000000-0000-4000-8000-000000000001', false)$$,
  'dad turns all notifications off'
);
select test.login('grandma@fixture.test');
select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000113',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'after all off',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'a post succeeds when someone turned notifications off'
);
reset role;

select is(
  (
    select count(*)::int
    from public.notification_outbox
    where ref_id = 'b4000000-0000-4000-8000-000000000113'
      and recipient_member_id = 'b2000000-0000-4000-8000-000000000002'
  ),
  0,
  'all-off creates no row'
);

update public.notification_prefs
set push = true
where member_id = 'b2000000-0000-4000-8000-000000000002'
  and space_id is null;

select test.login('grandpa@fixture.test');
set local role authenticated;
select lives_ok(
  $$
    select public.set_notifications_paused(
      'b0000000-0000-4000-8000-000000000001',
      now() + interval '2 hours'
    )
  $$,
  'grandpa pauses notifications'
);
select test.login('grandma@fixture.test');
select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000114',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'during pause',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'a post succeeds during a pause'
);
reset role;

select is(
  (
    select count(*)::int
    from public.notification_outbox
    where ref_id = 'b4000000-0000-4000-8000-000000000114'
      and recipient_member_id = 'b2000000-0000-4000-8000-000000000004'
  ),
  0,
  'a future muted_until creates no row'
);

update public.notification_prefs
set muted_until = now() - interval '1 minute'
where member_id = 'b2000000-0000-4000-8000-000000000004'
  and space_id is null;

select test.login('grandma@fixture.test');
set local role authenticated;
select lives_ok(
  $$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000115',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'after pause',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'a post succeeds after a pause has passed'
);
reset role;

select is(
  (
    select count(*)::int
    from public.notification_outbox
    where ref_id = 'b4000000-0000-4000-8000-000000000115'
      and recipient_member_id = 'b2000000-0000-4000-8000-000000000004'
  ),
  1,
  'a past muted_until still notifies'
);

select test.login('grandma@fixture.test');
set local role authenticated;
select lives_ok(
  $$
    update public.messages
    set body = 'edited marker'
    where id = 'b4000000-0000-4000-8000-000000000110'
  $$,
  'editing a post succeeds'
);
select lives_ok(
  $$
    update public.messages
    set deleted_at = now()
    where id = 'b4000000-0000-4000-8000-000000000110'
  $$,
  'deleting a post succeeds'
);
reset role;

select is(
  (select count(*)::int from public.notification_outbox where ref_id = 'b4000000-0000-4000-8000-000000000110'),
  4,
  'edits and deletes do not enqueue'
);

select test.login('mom@fixture.test');
set local role authenticated;
select lives_ok(
  $$
    update public.messages
    set deleted_at = null
    where id = 'b4000000-0000-4000-8000-000000000110'
  $$,
  'restoring a post succeeds'
);
reset role;

select is(
  (select count(*)::int from public.notification_outbox where ref_id = 'b4000000-0000-4000-8000-000000000110'),
  4,
  'a restore does not enqueue'
);

select lives_ok(
  $$
    update public.media
    set message_id = 'b4000000-0000-4000-8000-000000000110'
    where id = 'b5000000-0000-4000-8000-000000000004'
  $$,
  'attaching a photo does not fail'
);

select is(
  (select count(*)::int from public.notification_outbox where ref_id = 'b4000000-0000-4000-8000-000000000110'),
  4,
  'attaching a photo does not notify again'
);

select ok(
  pg_get_functiondef('private.enqueue_message_notifications(uuid)'::regprocedure)
    like '%space_viewer_member_ids%',
  'enqueue uses space_viewer_member_ids'
);

create temp table push_net_check (ok boolean);

do $$
declare
  queued boolean := false;
begin
  if to_regprocedure('vault.create_secret(text,text,text)') is not null then
    perform vault.create_secret('local-push-dev', 'push_send_secret', 'test');
    perform vault.create_secret(
      'http://127.0.0.1:54321/functions/v1/push-send',
      'push_send_url',
      'test'
    );
  end if;

  perform private.notify_push_send();

  if to_regclass('net.http_request_queue') is not null then
    execute $q$
      select exists (
        select 1 from net.http_request_queue where url like '%push-send%'
      )
    $q$ into queued;
  else
    queued := true;
  end if;

  insert into push_net_check values (queued);
exception
  when others then
    insert into push_net_check values (false);
end;
$$;

select ok(
  (select ok from push_net_check),
  'with vault secrets set, pg_net queues push-send or the queue table is not exposed'
);

select * from finish();
rollback;
