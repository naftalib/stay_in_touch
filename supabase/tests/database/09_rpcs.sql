begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(8);

select test.login('mom@fixture.test');
set local role authenticated;

select results_eq(
  $$select label from public.space_audience('b3000000-0000-4000-8000-000000000001')$$,
  $$values ('Ari'), ('Dad'), ('Grandma'), ('Grandpa'), ('Mom'), ('Noa')$$,
  'General audience is every active member'
);

select results_eq(
  $$select label from public.space_audience('b3000000-0000-4000-8000-000000000004')$$,
  $$values ('Dad'), ('Grandma'), ('Grandpa'), ('Mom'), ('Noa')$$,
  'a child space audience is admins, grandparents, and that child'
);

select results_eq(
  $$select label from public.space_audience('b3000000-0000-4000-8000-000000000002')$$,
  $$values ('Dad'), ('Grandma'), ('Grandpa'), ('Mom')$$,
  'a parent space audience excludes children'
);

select test.login('noa@fixture.test');

select throws_ok(
  $$select * from public.space_audience('b3000000-0000-4000-8000-000000000002')$$,
  '42501',
  NULL,
  'space_audience refuses a space the caller cannot see'
);

select is(
  (
    select unread_count::int
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000001'
  ),
  3,
  'unread counts include other people''s messages and media'
);

reset role;
update public.messages
set deleted_at = now()
where id = 'b4000000-0000-4000-8000-000000000001';

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  (
    select unread_count::int
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000001'
  ),
  2,
  'unread counts skip deleted rows and the caller''s own posts'
);

select lives_ok(
  $$select public.mark_space_read('b3000000-0000-4000-8000-000000000001')$$,
  'a viewer can mark a space read'
);

select is(
  (
    select unread_count::int
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000001'
  ),
  0,
  'mark_space_read clears the unread count'
);

select * from finish();
rollback;
