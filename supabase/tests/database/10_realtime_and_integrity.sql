begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(10);

select has_trigger(
  'public',
  'messages',
  'messages_broadcast',
  'messages broadcast to the space topic'
);
select has_trigger(
  'public',
  'media',
  'media_broadcast',
  'media broadcast to the space topic'
);

insert into realtime.messages (id, topic, extension, payload, event, private)
values
  (
    'b8000000-0000-4000-8000-000000000001',
    'space:b3000000-0000-4000-8000-000000000002',
    'broadcast',
    '{}'::jsonb,
    'INSERT',
    true
  ),
  (
    'b8000000-0000-4000-8000-000000000002',
    'space:b3000000-0000-4000-8000-000000000002',
    'presence',
    '{}'::jsonb,
    'INSERT',
    true
  ),
  (
    'b8000000-0000-4000-8000-000000000003',
    'space:b3000000-0000-4000-8000-000000000004',
    'broadcast',
    '{}'::jsonb,
    'INSERT',
    true
  );

select test.login('noa@fixture.test');
set local role authenticated;
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000002', true);

select is_empty(
  $$select 1 from realtime.messages where id = 'b8000000-0000-4000-8000-000000000001'$$,
  'a child cannot receive a parent space broadcast'
);

select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004', true);

select ok(
  exists (
    select 1
    from realtime.messages
    where id = 'b8000000-0000-4000-8000-000000000003'
  ),
  'a child can receive broadcasts for their own space topic'
);
select is_empty(
  $$select 1 from realtime.messages where id = 'b8000000-0000-4000-8000-000000000001'$$,
  'a child subscribed to their own space cannot read a parent topic row'
);
select is_empty(
  $$select 1 from realtime.messages where id = 'b8000000-0000-4000-8000-000000000002'$$,
  'only the broadcast extension is readable'
);

select test.login('mom@fixture.test');
select set_config('realtime.topic', 'not-a-space', true);

select is_empty(
  $$select 1 from realtime.messages where id = 'b8000000-0000-4000-8000-000000000001'$$,
  'a topic that is not space:<id> is denied'
);

reset role;

insert into public.family_members (id, family_id, user_id, role, label)
values (
  'b2000000-0000-4000-8000-000000000010',
  'b0000000-0000-4000-8000-000000000002',
  'b1000000-0000-4000-8000-00000000000c',
  'member',
  'No Space'
);

select throws_ok(
  $$
    insert into public.spaces (family_id, kind, title, created_by)
    values (
      'b0000000-0000-4000-8000-000000000001',
      'general',
      'Second General',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23505',
  NULL,
  'a family has one General space'
);

select throws_ok(
  $$
    insert into public.spaces (family_id, kind, owner_member_id, title, created_by)
    values (
      'b0000000-0000-4000-8000-000000000001',
      'member',
      'b2000000-0000-4000-8000-000000000001',
      'Mom again',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23505',
  NULL,
  'a member has at most one space'
);

select throws_ok(
  $$
    insert into public.spaces (family_id, kind, owner_member_id, title, created_by)
    values (
      'b0000000-0000-4000-8000-000000000001',
      'member',
      'b2000000-0000-4000-8000-000000000010',
      'Wrong family',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23503',
  NULL,
  'an owner space must belong to the owner''s family'
);

select * from finish();
rollback;
