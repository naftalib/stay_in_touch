-- Review: a user in two families, and an admin of one family acting on another.
-- other@fixture.test is admin of Other Family and a child in Fixture Family.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(27);

select test.login('other@fixture.test');
set local role authenticated;

-- Visibility: admin role in family B must not widen access in family A.
select results_eq(
  $$select id::text from public.spaces where family_id = 'b0000000-0000-4000-8000-000000000001' order by id$$,
  $$values
    ('b3000000-0000-4000-8000-000000000001'),
    ('b3000000-0000-4000-8000-000000000020')$$,
  'two-family user: child role in A sees only General and own space in A'
);
select is(
  (select count(*)::int from public.spaces where family_id = 'b0000000-0000-4000-8000-000000000002'),
  2,
  'two-family user: admin role in B still sees every space in B'
);
select is(
  (
    select count(*)::int
    from public.messages
    where family_id = 'b0000000-0000-4000-8000-000000000001'
      and space_id not in (
        'b3000000-0000-4000-8000-000000000001',
        'b3000000-0000-4000-8000-000000000020'
      )
  ),
  0,
  'two-family user: no messages from parent or sibling spaces in A'
);
select is(
  (
    select count(*)::int
    from public.media
    where family_id = 'b0000000-0000-4000-8000-000000000001'
      and space_id <> 'b3000000-0000-4000-8000-000000000001'
  ),
  0,
  'two-family user: no media from parent or sibling spaces in A'
);
select is_empty(
  $$select 1 from public.invitations where family_id = 'b0000000-0000-4000-8000-000000000001'$$,
  'two-family user: cannot read invitations of the family where they are a child'
);
select is(
  (select count(*)::int from public.invitations where family_id = 'b0000000-0000-4000-8000-000000000002'),
  1,
  'two-family user: can read invitations of the family they administer'
);
select results_eq(
  $$select action from public.audit_log order by action$$,
  $$values ('fixture.f2')$$,
  'two-family user: reads only the audit log of the family they administer'
);
select is(
  (select count(*)::int from public.unread_counts('b0000000-0000-4000-8000-000000000001')),
  2,
  'two-family user: unread_counts in A lists only their two viewable spaces'
);
select throws_ok(
  $$select * from public.space_audience('b3000000-0000-4000-8000-000000000002')$$,
  '42501',
  NULL,
  'two-family user: space_audience refuses a parent space in A'
);

-- Writes: admin rights in B must not apply to rows in A.
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000001'$$),
  0,
  'two-family user: cannot soft-delete a parent message in A General (0 rows)'
);
select is(
  (select deleted_at from public.messages where id = 'b4000000-0000-4000-8000-000000000001'),
  NULL,
  'two-family user: the parent message is still not deleted'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000008',
      'Posting in A with my B membership',
      'b1000000-0000-4000-8000-000000000008'
    )
  $$,
  '42501',
  NULL,
  'two-family user: cannot post in A using their membership from B'
);
select is(
  test.rows($$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000020',
      'Posting in A with my A membership',
      'b1000000-0000-4000-8000-000000000008'
    )
  $$),
  1,
  'two-family user: can post in A General with their A membership'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000020',
      'Into a parent space',
      'b1000000-0000-4000-8000-000000000008'
    )
  $$,
  '23503',
  NULL,
  'two-family user: cannot post in a parent space in A'
);

-- Admin RPCs: the family is taken from the target row, so B's admin cannot act on A.
select throws_ok(
  $$select public.create_invitation('b0000000-0000-4000-8000-000000000001', 'x@fixture.test', 'admin', 'X')$$,
  '42501',
  NULL,
  'admin of B cannot create an invitation in A'
);
select throws_ok(
  $$select public.revoke_invitation('b6000000-0000-4000-8000-000000000001')$$,
  '42501',
  NULL,
  'admin of B cannot revoke an invitation in A'
);
select throws_ok(
  $$select public.remove_member('b2000000-0000-4000-8000-000000000005')$$,
  '42501',
  NULL,
  'admin of B cannot remove a member of A'
);
select throws_ok(
  $$select public.change_member_role('b2000000-0000-4000-8000-000000000005', 'admin')$$,
  '42501',
  NULL,
  'admin of B cannot change a role in A'
);
select throws_ok(
  $$select public.change_member_role('b2000000-0000-4000-8000-000000000020', 'admin')$$,
  '42501',
  NULL,
  'admin of B cannot promote their own child membership in A'
);
select throws_ok(
  $$select public.rename_space('b3000000-0000-4000-8000-000000000001', 'Hijacked')$$,
  '42501',
  NULL,
  'admin of B cannot rename a space in A'
);
select throws_ok(
  $$select public.archive_space('b3000000-0000-4000-8000-000000000002')$$,
  '42501',
  NULL,
  'admin of B cannot archive a space in A'
);
select throws_ok(
  $$select public.create_member_space('b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000020', 'Mine')$$,
  '42501',
  NULL,
  'admin of B cannot create a space in A'
);
select throws_ok(
  $$select public.create_member_space('b0000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000003', 'Smuggled')$$,
  '42501',
  NULL,
  'admin of B cannot create a space in B for a member of A by passing B''s family id'
);

-- Mom (admin of A only) cannot act on B.
select test.login('mom@fixture.test');

select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000008'$$),
  0,
  'admin of A cannot soft-delete a message in B (0 rows)'
);
select throws_ok(
  $$select public.remove_member('b2000000-0000-4000-8000-000000000009')$$,
  '42501',
  NULL,
  'admin of A cannot remove a member of B'
);
select is_empty(
  $$select 1 from public.profiles where id = 'b1000000-0000-4000-8000-000000000009'$$,
  'admin of A cannot read profiles of people only in B'
);
select is(
  (select count(*)::int from public.family_members where family_id = 'b0000000-0000-4000-8000-000000000002'),
  0,
  'admin of A cannot read the member list of B'
);

select * from finish();
rollback;
