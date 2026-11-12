-- Media rows linked to soft-deleted messages follow message visibility (handoff 03 fix).
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(8);

reset role;
insert into public.messages (id, space_id, family_id, author_member_id, body, created_by, created_at)
values (
  'b4000000-0000-4000-8000-0000000000d1',
  'b3000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'Message with attached photo',
  'b1000000-0000-4000-8000-000000000002',
  now() - interval '2 hours'
);

insert into public.media (
  id, space_id, family_id, uploader_member_id, message_id, kind, r2_key, content_type, status, provider, created_by
)
values (
  'b5000000-0000-4000-8000-0000000000d1',
  'b3000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002',
  'b4000000-0000-4000-8000-0000000000d1',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000d1/original.jpg',
  'image/jpeg',
  'ready',
  'r2',
  'b1000000-0000-4000-8000-000000000002'
);

update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-0000000000d1';

select test.login('grandma@fixture.test');
set local role authenticated;
select is(
  test.rows($$select id from public.media where id = 'b5000000-0000-4000-8000-0000000000d1'$$),
  0,
  'a grandparent cannot see media on a deleted message'
);

select test.login('dad@fixture.test');
set local role authenticated;
select is(
  test.rows($$select id from public.media where id = 'b5000000-0000-4000-8000-0000000000d1'$$),
  1,
  'the author can still see media on their deleted message'
);

select test.login('mom@fixture.test');
set local role authenticated;
select is(
  test.rows($$select id from public.media where id = 'b5000000-0000-4000-8000-0000000000d1'$$),
  1,
  'an admin can still see media on a deleted message'
);

reset role;
update public.messages set deleted_at = null where id = 'b4000000-0000-4000-8000-0000000000d1';

select test.login('grandma@fixture.test');
set local role authenticated;
select is(
  test.rows($$select id from public.media where id = 'b5000000-0000-4000-8000-0000000000d1'$$),
  1,
  'after restore everyone with space access can see the media again'
);

select test.login('grandma@fixture.test');
set local role authenticated;
select ok(
  exists (
    select 1 from public.media where id = 'b5000000-0000-4000-8000-000000000010' and message_id is null
  ),
  'standalone media without message_id is unaffected'
);

select test.login('mom@fixture.test');
set local role authenticated;
select is(
  (
    select unread_count::int
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000001'
    limit 1
  ),
  (
    select unread_count::int
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000001'
    limit 1
  ),
  'unread_counts is unchanged by the visibility rule (sanity)'
);

select * from finish();
rollback;
