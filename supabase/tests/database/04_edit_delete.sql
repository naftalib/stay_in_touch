begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(10);

select test.login('noa@fixture.test');
set local role authenticated;

select lives_ok(
  $$
    update public.messages
    set body = 'Noa edited'
    where id = 'b4000000-0000-4000-8000-000000000005'
  $$,
  'author can edit their own message'
);

select lives_ok(
  $$
    update public.messages
    set deleted_at = now()
    where id = 'b4000000-0000-4000-8000-000000000005'
  $$,
  'author can soft-delete their own message'
);

update public.messages
set body = 'Noa rewrites Grandma'
where id = 'b4000000-0000-4000-8000-000000000006';

select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000006'),
  'Grandma in Noa space',
  'child cannot edit a grandparent message in their own space'
);

update public.messages
set deleted_at = now()
where id = 'b4000000-0000-4000-8000-000000000006';

select ok(
  (select deleted_at is null from public.messages where id = 'b4000000-0000-4000-8000-000000000006'),
  'child cannot soft-delete a grandparent message'
);

select throws_ok(
  $$delete from public.messages where id = 'b4000000-0000-4000-8000-000000000006'$$,
  '42501',
  NULL,
  'no role can hard-delete a message'
);

select test.login('grandma@fixture.test');

update public.messages
set deleted_at = now()
where id = 'b4000000-0000-4000-8000-000000000003';

select ok(
  (select deleted_at is null from public.messages where id = 'b4000000-0000-4000-8000-000000000003'),
  'grandparent cannot delete a parent message'
);

select test.login('mom@fixture.test');

select lives_ok(
  $$
    update public.messages
    set deleted_at = now()
    where id = 'b4000000-0000-4000-8000-000000000006'
  $$,
  'admin can soft-delete someone else''s message'
);

select throws_ok(
  $$
    update public.messages
    set body = 'Admin rewrite'
    where id = 'b4000000-0000-4000-8000-000000000006'
  $$,
  '42501',
  NULL,
  'admin cannot change the body of someone else''s message'
);

select throws_ok(
  $$
    update public.messages
    set space_id = 'b3000000-0000-4000-8000-000000000001'
    where id = 'b4000000-0000-4000-8000-000000000003'
  $$,
  '42501',
  NULL,
  'nobody can move a message to another space'
);

select throws_ok(
  $$
    update public.messages
    set family_id = 'b0000000-0000-4000-8000-000000000002'
    where id = 'b4000000-0000-4000-8000-000000000003'
  $$,
  '42501',
  NULL,
  'nobody can move a message to another family'
);

select * from finish();
rollback;
