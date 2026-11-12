-- Review: realtime topic abuse, broadcast trigger behaviour, and client sends.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(18);

insert into realtime.messages (id, topic, extension, payload, event, private)
values
  ('b8000000-0000-4000-8000-000000000011', 'space:b3000000-0000-4000-8000-000000000001', 'broadcast', '{}'::jsonb, 'INSERT', true),
  ('b8000000-0000-4000-8000-000000000012', 'space:b3000000-0000-4000-8000-000000000004', 'broadcast', '{}'::jsonb, 'INSERT', true);

-- Removed member and other family are denied; grandparent is allowed.
select test.login('uncle@fixture.test');
set local role authenticated;
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000001', true);
select is_empty(
  $$select 1 from realtime.messages where topic = 'space:b3000000-0000-4000-8000-000000000001'$$,
  'a removed member cannot join General'
);

select test.login('other@fixture.test');
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004', true);
select is_empty(
  $$select 1 from realtime.messages where topic = 'space:b3000000-0000-4000-8000-000000000004'$$,
  'an admin of another family cannot join a child space'
);

select test.login('otherchild@fixture.test');
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000001', true);
select is_empty(
  $$select 1 from realtime.messages$$,
  'a child of another family cannot join General of this family'
);

select test.login('grandma@fixture.test');
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004', true);
select isnt_empty(
  $$select 1 from realtime.messages where topic = 'space:b3000000-0000-4000-8000-000000000004'$$,
  'a grandparent can join a child space'
);

-- Malformed topics deny without raising.
select set_config('realtime.topic', 'space:not-a-uuid', true);
select lives_ok($$select count(*) from realtime.messages$$, 'a non-uuid topic does not raise');
select is_empty($$select 1 from realtime.messages$$, 'a non-uuid topic is denied');
select set_config('realtime.topic', 'space:', true);
select is_empty($$select 1 from realtime.messages$$, 'an empty space id is denied');
select set_config('realtime.topic', 'SPACE:b3000000-0000-4000-8000-000000000004', true);
select is_empty($$select 1 from realtime.messages$$, 'the prefix is case-sensitive');
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004''; select 1; --', true);
select is_empty($$select 1 from realtime.messages$$, 'an injection-shaped topic is denied');
select set_config('realtime.topic', 'family:b0000000-0000-4000-8000-000000000001', true);
select is_empty($$select 1 from realtime.messages$$, 'a non-space prefix is denied');

-- Clients cannot publish on any topic.
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$
    insert into realtime.messages (topic, extension, payload, event, private)
    values ('space:b3000000-0000-4000-8000-000000000004', 'broadcast', '{"forged":true}', 'INSERT', true)
  $$,
  '42501', NULL, 'a viewer cannot publish a broadcast on a space topic'
);
select throws_ok(
  $$
    insert into realtime.messages (topic, extension, payload, event, private)
    values ('space:b3000000-0000-4000-8000-000000000004', 'presence', '{}', 'track', true)
  $$,
  '42501', NULL, 'a viewer cannot track presence on a space topic'
);

-- The trigger emits on insert and on soft-delete, to space:<space_id>.
select test.login('noa@fixture.test');
select is(
  test.rows($$
    insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
    values (
      'b4000000-0000-4000-8000-000000000094',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'Broadcast me',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$),
  1, 'a child posts in their own space'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000094'$$),
  1, 'the child soft-deletes it'
);

reset role;
select results_eq(
  $$
    select topic, event
    from realtime.messages
    where payload -> 'record' ->> 'id' = 'b4000000-0000-4000-8000-000000000094'
    order by inserted_at, event
  $$,
  $$values
    ('space:b3000000-0000-4000-8000-000000000004', 'INSERT'),
    ('space:b3000000-0000-4000-8000-000000000004', 'UPDATE')$$,
  'insert and soft-delete both broadcast to space:<space_id>'
);

update public.media set deleted_at = now() where id = 'b5000000-0000-4000-8000-000000000004';
select is(
  (
    select count(*)::int
    from realtime.messages
    where topic = 'space:b3000000-0000-4000-8000-000000000004'
      and payload ->> 'table' = 'media'
      and event = 'UPDATE'
  ),
  1, 'a media update broadcasts to its space topic'
);

-- Known gaps (TODO until fixed).
select todo_start('Finding: broadcast payload carries the deleted body to every subscriber');
select is(
  (
    select payload -> 'record' ->> 'body'
    from realtime.messages
    where payload -> 'record' ->> 'id' = 'b4000000-0000-4000-8000-000000000094'
      and event = 'UPDATE'
  ),
  NULL, 'the soft-delete broadcast does not include the deleted body'
);
select todo_end();

select todo_start('Finding: dblink is left installed and executable by API roles');
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'extensions'
      and p.proname like 'dblink%'
      and (
        has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute')
      )
  ),
  'anon and authenticated cannot execute dblink functions'
);
select todo_end();

select * from finish();
rollback;
