begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(8);

select test.login('uncle@fixture.test');
set local role authenticated;

select is(
  (select count(*)::int from public.spaces),
  0,
  'a removed member sees no spaces'
);
select is(
  (select count(*)::int from public.messages),
  0,
  'a removed member sees no messages'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000007',
      'Uncle posts again',
      'b1000000-0000-4000-8000-000000000007'
    )
  $$,
  '23503',
  NULL,
  'a removed member cannot post'
);

select test.login('mom@fixture.test');

select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000002'),
  'Uncle was here',
  'a removed member''s earlier post stays visible'
);

select test.login('noa@fixture.test');

select ok(
  exists (
    select 1
    from public.family_members
    where id = 'b2000000-0000-4000-8000-000000000007'
      and status = 'removed'
  ),
  'a child can read the family member list, including removed people'
);
select is(
  (select count(*)::int from public.family_members where family_id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  'a child cannot read the other family''s members'
);
select ok(
  exists (
    select 1 from public.profiles where id = 'b1000000-0000-4000-8000-000000000007'
  ),
  'a child can read profiles of their own family'
);
select is_empty(
  $$select 1 from public.profiles where id = 'b1000000-0000-4000-8000-000000000008'$$,
  'a child cannot read the other family''s profiles'
);

select * from finish();
rollback;
