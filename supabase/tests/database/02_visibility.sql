begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(16);

-- Admin sees every space in their family and nothing from the other family.
select test.login('mom@fixture.test');
set local role authenticated;

select is(
  (select count(*)::int from public.spaces),
  5,
  'admin sees all five spaces in their family'
);
select is(
  (select count(*)::int from public.messages),
  7,
  'admin sees every message in their family'
);
select is(
  (select count(*)::int from public.media),
  5,
  'admin sees every media row in their family'
);
select is_empty(
  $$select 1 from public.messages where id = 'b4000000-0000-4000-8000-000000000008'$$,
  'admin cannot see the other family message'
);
select is_empty(
  $$select 1 from public.spaces where id = 'b3000000-0000-4000-8000-000000000011'$$,
  'admin cannot see the other family space'
);

-- Grandparent sees the same family-wide set.
select test.login('grandma@fixture.test');

select is(
  (select count(*)::int from public.spaces),
  5,
  'grandparent sees all five spaces'
);
select is(
  (select count(*)::int from public.messages),
  7,
  'grandparent sees every message'
);
select is(
  (select count(*)::int from public.media),
  5,
  'grandparent sees every media row'
);
select is(
  (select count(*)::int from public.messages where space_id = 'b3000000-0000-4000-8000-000000000004'),
  2,
  'grandparent sees the child space'
);

-- Child sees General and their own space only.
select test.login('noa@fixture.test');

select is(
  (select count(*)::int from public.spaces),
  2,
  'child sees two spaces'
);
select results_eq(
  $$select id::text from public.spaces order by id$$,
  $$values
    ('b3000000-0000-4000-8000-000000000001'),
    ('b3000000-0000-4000-8000-000000000004')$$,
  'child sees General and their own space'
);
select is_empty(
  $$select 1 from public.spaces where id = 'b3000000-0000-4000-8000-000000000002'$$,
  'child cannot see a parent space row'
);
select is_empty(
  $$select 1 from public.spaces where id = 'b3000000-0000-4000-8000-000000000005'$$,
  'child cannot see a sibling space row'
);
select is(
  (select count(*)::int from public.messages),
  4,
  'child sees General and own-space messages only'
);
select is(
  (select count(*)::int from public.media),
  2,
  'child sees General and own-space media only'
);
select is_empty(
  $$select 1 from public.messages where id = 'b4000000-0000-4000-8000-000000000007'$$,
  'child cannot see a sibling message'
);

select * from finish();
rollback;
