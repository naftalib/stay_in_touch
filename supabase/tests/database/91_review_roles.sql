-- Review: grandparent admin attempts, child writes outside their spaces,
-- removed member, and a soft-deleted family. Deny cases assert row counts.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(33);

-- Grandparent: sees and posts everywhere, manages nothing.
select test.login('grandma@fixture.test');
set local role authenticated;

select throws_ok(
  $$select public.revoke_invitation('b6000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'grandparent cannot revoke an invitation'
);
select throws_ok(
  $$select public.remove_member('b2000000-0000-4000-8000-000000000005')$$,
  '42501', NULL, 'grandparent cannot remove a member'
);
select throws_ok(
  $$select public.change_member_role('b2000000-0000-4000-8000-000000000003', 'admin')$$,
  '42501', NULL, 'grandparent cannot promote themselves to admin'
);
select throws_ok(
  $$select public.create_member_space('b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000005', 'Extra')$$,
  '42501', NULL, 'grandparent cannot create a space'
);
select throws_ok(
  $$select public.archive_space('b3000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'grandparent cannot archive a space'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000003'$$),
  0, 'grandparent cannot soft-delete a parent message (0 rows)'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000005'$$),
  0, 'grandparent cannot soft-delete a child message (0 rows)'
);
select is(
  test.rows($$update public.messages set body = 'Grandma rewrites' where id = 'b4000000-0000-4000-8000-000000000005'$$),
  0, 'grandparent cannot edit a child message (0 rows)'
);
select is(
  test.rows($$update public.media set deleted_at = now() where id = 'b5000000-0000-4000-8000-000000000003'$$),
  0, 'grandparent cannot soft-delete a parent''s media (0 rows)'
);
select is(
  test.rows($$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'Grandma in Mom space',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$),
  1, 'grandparent can post in a parent space'
);

-- Child: nothing outside General and their own space, for reads and writes.
select test.login('noa@fixture.test');

select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000007'$$),
  0, 'child cannot soft-delete a sibling message (0 rows)'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000001'$$),
  0, 'child cannot soft-delete a parent message in General (0 rows)'
);
select is(
  test.rows($$update public.media set deleted_at = now() where id = 'b5000000-0000-4000-8000-000000000004'$$),
  0, 'child cannot soft-delete a grandparent''s media in the child''s own space (0 rows)'
);
select is(
  test.rows($$update public.media set caption = 'Noa caption' where id = 'b5000000-0000-4000-8000-000000000004'$$),
  0, 'child cannot change a grandparent''s caption in the child''s own space (0 rows)'
);
select is_empty(
  $$select 1 from public.media where space_id in ('b3000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000005')$$,
  'child cannot read media in a parent or sibling space'
);
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000091',
      'b3000000-0000-4000-8000-000000000005',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000005/b5000000-0000-4000-8000-000000000091/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '23503', NULL, 'child cannot upload media into a sibling space'
);
select throws_ok(
  $$
    insert into public.notification_prefs (member_id, space_id)
    values ('b2000000-0000-4000-8000-000000000005', 'b3000000-0000-4000-8000-000000000005')
  $$,
  '23514', NULL, 'child cannot store notification prefs for a sibling space'
);
select throws_ok(
  $$
    insert into public.space_reads (member_id, space_id, last_read_at)
    values ('b2000000-0000-4000-8000-000000000005', 'b3000000-0000-4000-8000-000000000002', now())
  $$,
  '23514', NULL, 'child cannot store a read marker for a parent space'
);
select throws_ok(
  $$select public.mark_space_read('b3000000-0000-4000-8000-000000000005')$$,
  '42501', NULL, 'child cannot mark a sibling space read'
);
select is(
  test.rows($$update public.profiles set display_name = 'Hacked' where id = 'b1000000-0000-4000-8000-000000000001'$$),
  0, 'child cannot rename another person''s profile (0 rows)'
);
select throws_ok(
  $$update public.family_members set role = 'admin' where id = 'b2000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'child cannot change their own role directly'
);
select throws_ok(
  $$update public.spaces set owner_member_id = 'b2000000-0000-4000-8000-000000000005' where id = 'b3000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'child cannot take over a space directly'
);

-- Removed member: everything is gone, including edits to their own old posts.
select test.login('uncle@fixture.test');

select is(
  (
    (select count(*) from public.families)
    + (select count(*) from public.family_members)
    + (select count(*) from public.media)
    + (select count(*) from public.space_reads)
  )::int,
  0, 'removed member sees no families, members, media, or read markers'
);
select results_eq(
  $$select id::text from public.profiles$$,
  $$values ('b1000000-0000-4000-8000-000000000007')$$,
  'removed member sees only their own profile'
);
select is(
  test.rows($$update public.messages set body = 'Uncle edits after removal' where id = 'b4000000-0000-4000-8000-000000000002'$$),
  0, 'removed member cannot edit their earlier post (0 rows)'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000002'$$),
  0, 'removed member cannot delete their earlier post (0 rows)'
);
select throws_ok(
  $$select * from public.unread_counts('b0000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'removed member cannot call unread_counts'
);
select throws_ok(
  $$select * from public.space_audience('b3000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'removed member cannot call space_audience'
);

-- Admin soft-deletes a removed member's post.
select test.login('mom@fixture.test');
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000002'$$),
  1, 'admin can soft-delete a removed member''s post'
);

-- Soft-deleted family: its members lose access.
reset role;
update public.families set deleted_at = now() where id = 'b0000000-0000-4000-8000-000000000002';
select test.login('otherchild@fixture.test');
set local role authenticated;

select is(
  (select count(*)::int from public.spaces),
  0, 'members of a soft-deleted family see no spaces'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000011',
      'b0000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000009',
      'Posting into a deleted family',
      'b1000000-0000-4000-8000-000000000009'
    )
  $$,
  '23503', NULL, 'members of a soft-deleted family cannot post'
);

-- The admin of the deleted family keeps their child access in Fixture Family.
select test.login('other@fixture.test');
select is(
  (select count(*)::int from public.spaces),
  2, 'a deleted family does not affect the same user''s other family'
);
select throws_ok(
  $$select public.create_invitation('b0000000-0000-4000-8000-000000000002', 'y@fixture.test', 'member', 'Y')$$,
  '42501', NULL, 'admin of a soft-deleted family can no longer use admin RPCs'
);

select * from finish();
rollback;
