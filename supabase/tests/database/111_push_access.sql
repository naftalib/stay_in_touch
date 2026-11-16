-- Subscription ownership, preference bounds, and service-only grants.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(28);

set local role anon;
select throws_ok(
  $$select public.register_push_subscription('https://push.example.test/anon', 'abc', 'def', null)$$,
  '42501',
  NULL,
  'anon cannot register a push subscription'
);

select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  $$select public.register_push_subscription('http://push.example.test/mom', 'abc', 'def', null)$$,
  '22023',
  NULL,
  'non-https endpoints are rejected'
);

select throws_ok(
  $$select public.register_push_subscription('https://push.example.test/' || repeat('a', 2100), 'abc', 'def', null)$$,
  '22023',
  NULL,
  'oversized endpoints are rejected'
);

select lives_ok(
  $$select public.register_push_subscription('https://push.example.test/shared-tablet', 'mom-key', 'mom-auth', 'tablet')$$,
  'mom registers the shared tablet'
);

select lives_ok(
  $$select public.register_push_subscription('https://push.example.test/mom-phone', 'mom-phone', 'mom-phone-auth', 'phone')$$,
  'mom registers her own phone'
);

select test.login('noa@fixture.test');

select lives_ok(
  $$select public.register_push_subscription('https://push.example.test/shared-tablet', 'noa-key', 'noa-auth', 'tablet')$$,
  'noa registers the same tablet endpoint'
);

select lives_ok(
  $$select public.unregister_push_subscription('https://push.example.test/mom-phone')$$,
  'noa unregister of mom phone is a no-op'
);

reset role;

select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example.test/shared-tablet'),
  1,
  'a shared endpoint is a single row'
);

select is(
  (select user_id::text from public.push_subscriptions where endpoint = 'https://push.example.test/shared-tablet'),
  'b1000000-0000-4000-8000-000000000005',
  'the shared endpoint is owned by noa'
);

select is(
  (select p256dh = 'noa-key' and auth = 'noa-auth' and disabled_at is null and failure_count = 0
   from public.push_subscriptions where endpoint = 'https://push.example.test/shared-tablet'),
  true,
  'ownership move replaces keys and clears disabled_at'
);

select is(
  (select user_id::text from public.push_subscriptions where endpoint = 'https://push.example.test/mom-phone'),
  'b1000000-0000-4000-8000-000000000001',
  'unregister does not remove another person row'
);

select test.login('noa@fixture.test');
set local role authenticated;

select is_empty(
  $$select 1 from public.push_subscriptions where endpoint = 'https://push.example.test/mom-phone'$$,
  'noa cannot read mom subscription'
);

select lives_ok(
  $$select public.unregister_push_subscription('https://push.example.test/shared-tablet')$$,
  'noa unregisters the tablet'
);

reset role;

select is(
  (select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example.test/shared-tablet'),
  0,
  'the caller row is removed on unregister'
);

select test.login('ari@fixture.test');
set local role authenticated;

select throws_ok(
  $$select public.set_space_muted('b3000000-0000-4000-8000-000000000004', true)$$,
  '42501',
  NULL,
  'ari cannot mute a space he cannot see'
);

select test.login('mom@fixture.test');

select throws_ok(
  $$select public.set_notifications_paused('b0000000-0000-4000-8000-000000000001', now() - interval '1 minute')$$,
  '22023',
  NULL,
  'a pause in the past is rejected'
);

select throws_ok(
  $$select public.set_notifications_paused('b0000000-0000-4000-8000-000000000001', now() + interval '7 days 1 minute')$$,
  '22023',
  NULL,
  'a pause beyond 7 days is rejected'
);

select lives_ok(
  $$select public.set_notifications_paused('b0000000-0000-4000-8000-000000000001', now() + interval '7 days')$$,
  'a pause of 7 days is accepted'
);

select lives_ok(
  $$select public.set_notifications_paused('b0000000-0000-4000-8000-000000000001', null)$$,
  'clearing a pause is accepted'
);

select lives_ok(
  $$select public.set_notifications_enabled('b0000000-0000-4000-8000-000000000001', false)$$,
  'mom can turn her own notifications off'
);

select test.login('noa@fixture.test');

select is_empty(
  $$
    update public.notification_prefs
    set push = true
    where member_id = 'b2000000-0000-4000-8000-000000000001'
    returning 1
  $$,
  'noa cannot change mom notification prefs'
);

select throws_ok(
  $$delete from public.notification_prefs where member_id = 'b2000000-0000-4000-8000-000000000005'$$,
  '42501',
  NULL,
  'notification prefs still have no delete'
);

reset role;

select is(
  (
    select push
    from public.notification_prefs
    where member_id = 'b2000000-0000-4000-8000-000000000001'
      and space_id is null
  ),
  false,
  'mom preference stayed off'
);

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  (select count(*)::int from public.my_notification_settings('b0000000-0000-4000-8000-000000000001')),
  3,
  'noa settings are the default row plus general and her space'
);

select test.login('grandma@fixture.test');

select is(
  (select count(*)::int from public.my_notification_settings('b0000000-0000-4000-8000-000000000001')),
  6,
  'grandma settings include every visible space'
);

reset role;

select is_empty(
  $$
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in (
        'enqueue_message_notifications',
        'notify_push_send',
        'messages_enqueue_notifications',
        'unread_total',
        'claim_push_batch',
        'push_group_facts',
        'record_push_result',
        'prune_notification_outbox',
        'schedule_push_send_sweep',
        'space_audience_member_ids',
        'record_push_delivery',
        'delivered_push_subscriptions'
      )
      and (
        has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute')
      )
  $$,
  'service-only push functions are not executable by clients'
);

select ok(
  to_regclass('cron.job') is null
  or not exists (select 1 from cron.job where jobname = 'push-send-sweep'),
  'the one-minute sweep is not scheduled without vault secrets'
);

select ok(
  pg_get_functiondef('public.claim_push_batch(integer)'::regprocedure) ilike '%for update skip locked%',
  'claim_push_batch locks rows with skip locked'
);

select * from finish();
rollback;
