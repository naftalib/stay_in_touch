-- Product decisions: archived spaces are read-only, a message and its media
-- count once, and a child +alias invite can only be accepted by that child.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select test.seed_user(
  'b1000000-0000-4000-8000-00000000000d',
  'mom+noa@fixture.test',
  'Noa'
);

select plan(30);

create function pg_temp.unread(p_space uuid)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select unread_count::int
  from public.unread_counts('b0000000-0000-4000-8000-000000000001')
  where space_id = p_space
$$;

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  pg_temp.unread('b3000000-0000-4000-8000-000000000004'),
  2,
  'baseline unread is the grandparent message plus standalone media'
);

reset role;
insert into public.messages (
  id, space_id, family_id, author_member_id, body, created_by, created_at
)
values (
  'b4000000-0000-4000-8000-000000000090',
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000003',
  'Picnic',
  'b1000000-0000-4000-8000-000000000003',
  pg_catalog.now() + interval '1 minute'
);
insert into public.media (
  id, space_id, family_id, uploader_member_id, message_id, kind, r2_key,
  content_type, status, created_by, created_at
)
values
  (
    'b5000000-0000-4000-8000-000000000090',
    'b3000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000003',
    'b4000000-0000-4000-8000-000000000090',
    'photo',
    'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000090/original.jpg',
    'image/jpeg', 'ready',
    'b1000000-0000-4000-8000-000000000003',
    pg_catalog.now() + interval '1 minute'
  ),
  (
    'b5000000-0000-4000-8000-000000000091',
    'b3000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000003',
    'b4000000-0000-4000-8000-000000000090',
    'photo',
    'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000091/original.jpg',
    'image/jpeg', 'ready',
    'b1000000-0000-4000-8000-000000000003',
    pg_catalog.now() + interval '1 minute'
  );

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  pg_temp.unread('b3000000-0000-4000-8000-000000000004'),
  3,
  'a message and the media attached to it count as one unread item'
);

reset role;
insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, content_type,
  status, created_by, created_at
)
values (
  'b5000000-0000-4000-8000-000000000092',
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000092/original.jpg',
  'image/jpeg', 'ready',
  'b1000000-0000-4000-8000-000000000001',
  pg_catalog.now() + interval '2 minutes'
);

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  pg_temp.unread('b3000000-0000-4000-8000-000000000004'),
  4,
  'standalone media with no message counts as its own unread item'
);

reset role;
insert into public.media (
  id, space_id, family_id, uploader_member_id, message_id, kind, r2_key,
  content_type, status, created_by, created_at
)
values (
  'b5000000-0000-4000-8000-000000000093',
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000003',
  'b4000000-0000-4000-8000-000000000005',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000093/original.jpg',
  'image/jpeg', 'ready',
  'b1000000-0000-4000-8000-000000000003',
  pg_catalog.now() + interval '3 minutes'
);

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  pg_temp.unread('b3000000-0000-4000-8000-000000000004'),
  5,
  'someone else''s media on the caller''s message counts as one item'
);

reset role;
update public.messages
set deleted_at = pg_catalog.now()
where id = 'b4000000-0000-4000-8000-000000000090';

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  pg_temp.unread('b3000000-0000-4000-8000-000000000004'),
  4,
  'soft-deleting a message removes that one item, attachments included'
);

reset role;
insert into public.space_reads (member_id, space_id, last_read_at)
values (
  'b2000000-0000-4000-8000-000000000005',
  'b3000000-0000-4000-8000-000000000004',
  pg_catalog.now() + interval '2 minutes'
);

select test.login('noa@fixture.test');
set local role authenticated;

select is(
  pg_temp.unread('b3000000-0000-4000-8000-000000000004'),
  1,
  'only content newer than last_read stays unread'
);

-- Archived spaces stay visible and reject every write.
select test.login('mom@fixture.test');
select public.archive_space('b3000000-0000-4000-8000-000000000004');

select test.login('noa@fixture.test');

select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000005'),
  'Noa space',
  'a child can still read a message in an archived space'
);
select ok(
  exists (
    select 1
    from public.spaces
    where id = 'b3000000-0000-4000-8000-000000000004'
      and archived_at is not null
  ),
  'a child can still see an archived space'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'After archive',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '42501', NULL, 'a child cannot post in an archived space'
);
select throws_ok(
  $$
    insert into public.media (
      id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by
    )
    values (
      'b5000000-0000-4000-8000-000000000094',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000094/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '42501', NULL, 'a child cannot upload in an archived space'
);

update public.messages
set body = 'rewritten'
where id = 'b4000000-0000-4000-8000-000000000005';
select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000005'),
  'Noa space',
  'a child cannot edit a message in an archived space'
);

update public.messages
set deleted_at = pg_catalog.now()
where id = 'b4000000-0000-4000-8000-000000000005';
select ok(
  (
    select deleted_at is null
    from public.messages
    where id = 'b4000000-0000-4000-8000-000000000005'
  ),
  'a child cannot soft-delete a message in an archived space'
);

select test.login('mom@fixture.test');
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'Admin after archive',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', NULL, 'an admin cannot post in an archived space'
);

update public.messages
set deleted_at = pg_catalog.now()
where id = 'b4000000-0000-4000-8000-000000000006';
select ok(
  (
    select deleted_at is null
    from public.messages
    where id = 'b4000000-0000-4000-8000-000000000006'
  ),
  'an admin cannot soft-delete in an archived space'
);

select test.login('grandma@fixture.test');
update public.media
set caption = 'nope'
where id = 'b5000000-0000-4000-8000-000000000004';
select ok(
  (
    select caption is null
    from public.media
    where id = 'b5000000-0000-4000-8000-000000000004'
  ),
  'a grandparent cannot edit media in an archived space'
);

select throws_ok(
  $$select public.unarchive_space('b3000000-0000-4000-8000-000000000004')$$,
  '42501', NULL, 'a grandparent cannot unarchive a space'
);

select test.login('mom@fixture.test');
select lives_ok(
  $$select public.unarchive_space('b3000000-0000-4000-8000-000000000004')$$,
  'an admin can unarchive a space'
);
select is(
  (
    select count(*)::int
    from public.audit_log
    where action = 'space.unarchived'
      and actor_user_id = 'b1000000-0000-4000-8000-000000000001'
  ),
  1, 'unarchive writes one audit row'
);
select lives_ok(
  $$select public.unarchive_space('b3000000-0000-4000-8000-000000000004')$$,
  'unarchive of an open space does nothing'
);
select is(
  (
    select count(*)::int
    from public.audit_log
    where action = 'space.unarchived'
  ),
  1, 'unarchive of an open space does not write another audit row'
);

select test.login('noa@fixture.test');
select lives_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'After unarchive',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  'a child can post again after the space is unarchived'
);

select test.login('mom@fixture.test');
select public.archive_space('b3000000-0000-4000-8000-000000000004');
update public.messages
set deleted_at = pg_catalog.now()
where id = 'b4000000-0000-4000-8000-000000000006';
select ok(
  (
    select deleted_at is null
    from public.messages
    where id = 'b4000000-0000-4000-8000-000000000006'
  ),
  're-archiving makes the space read-only again'
);
select public.unarchive_space('b3000000-0000-4000-8000-000000000004');
select lives_ok(
  $$
    update public.messages
    set deleted_at = pg_catalog.now()
    where id = 'b4000000-0000-4000-8000-000000000006'
  $$,
  'an admin can soft-delete again after unarchive'
);

-- A +alias child is a separate login. Mom cannot accept that invite.
select set_config(
  'test.child_invite',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'mom+noa@fixture.test',
    'member',
    'Noa',
    true
  )::text,
  true
);
select throws_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.child_invite')
  ),
  '42501', NULL,
  'a parent signed in as themselves cannot accept a child +alias invite'
);
select is(
  (
    select status::text
    from public.invitations
    where id = current_setting('test.child_invite')::uuid
  ),
  'pending',
  'the child invite stays pending after the parent tries to accept it'
);
select is_empty(
  $$
    select 1
    from public.family_members
    where user_id = 'b1000000-0000-4000-8000-00000000000d'
  $$,
  'the parent attempt does not create the child membership'
);
select is(
  (
    select count(*)::int
    from public.family_members
    where user_id = 'b1000000-0000-4000-8000-000000000001'
      and status = 'active'
  ),
  1, 'the parent stays a single member of the family'
);

select test.login('mom+noa@fixture.test');
select lives_ok(
  format(
    'select public.accept_invite(%L)',
    current_setting('test.child_invite')
  ),
  'the child accepts their own invite while signed in as the alias'
);
select is(
  (
    select user_id
    from public.family_members
    where family_id = 'b0000000-0000-4000-8000-000000000001'
      and label = 'Noa'
      and status = 'active'
      and user_id = 'b1000000-0000-4000-8000-00000000000d'
  ),
  'b1000000-0000-4000-8000-00000000000d'::uuid,
  'the accepted membership belongs to the alias user'
);
select test.login('mom@fixture.test');
select is(
  (
    select accepted_user_id
    from public.invitations
    where id = current_setting('test.child_invite')::uuid
  ),
  'b1000000-0000-4000-8000-00000000000d'::uuid,
  'the invitation records the child as the acceptor'
);

select * from finish();
rollback;
