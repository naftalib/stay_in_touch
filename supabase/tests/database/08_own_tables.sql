begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(8);

select test.login('mom@fixture.test');
set local role authenticated;

select lives_ok(
  $$
    insert into public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
    values (
      'b7000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'https://push.example.test/mom',
      'key',
      'auth'
    )
  $$,
  'a user can store their own push subscription'
);

select lives_ok(
  $$
    insert into public.notification_prefs (member_id, push, email)
    values (
      'b2000000-0000-4000-8000-000000000001',
      true,
      'off'
    )
  $$,
  'a user can store their own notification prefs'
);

select lives_ok(
  $$
    insert into public.space_reads (member_id, space_id, last_read_at)
    values (
      'b2000000-0000-4000-8000-000000000001',
      'b3000000-0000-4000-8000-000000000001',
      now()
    )
  $$,
  'a user can store their own read marker'
);

select test.login('noa@fixture.test');

select is_empty(
  $$select 1 from public.push_subscriptions$$,
  'push subscriptions are invisible to other users'
);
select throws_ok(
  $$
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values (
      'b1000000-0000-4000-8000-000000000001',
      'https://push.example.test/stolen',
      'key',
      'auth'
    )
  $$,
  '42501',
  NULL,
  'a user cannot write someone else''s push subscription'
);
select is_empty(
  $$select 1 from public.notification_prefs$$,
  'notification prefs are invisible to other users'
);
select is_empty(
  $$select 1 from public.space_reads$$,
  'read markers are invisible to other users'
);
select throws_ok(
  'select id from public.notification_outbox',
  '42501',
  NULL,
  'clients cannot read the notification outbox'
);

select * from finish();
rollback;
