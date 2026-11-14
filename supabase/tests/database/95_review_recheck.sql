-- Review recheck: archived-space write paths, deleted-content visibility,
-- confirmed-email invites, broadcast payload shape, topic matching, and helper
-- exposure. Open questions are TODO blocks.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(26);

-- Archive Noa's space after a few rows exist in it.
reset role;
update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000006';
update public.spaces set archived_at = now() where id = 'b3000000-0000-4000-8000-000000000004';

-- Archived: every content write path is closed, including for admins.
select test.login('mom@fixture.test');
set local role authenticated;
select is(
  test.rows($$update public.messages set deleted_at = null where id = 'b4000000-0000-4000-8000-000000000006'$$),
  0, 'archived: an admin cannot restore a deleted message (0 rows)'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000005'$$),
  0, 'archived: an admin cannot soft-delete a message (0 rows)'
);
select is(
  test.rows($$update public.media set deleted_at = now() where id = 'b5000000-0000-4000-8000-000000000004'$$),
  0, 'archived: an admin cannot soft-delete media (0 rows)'
);
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, message_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000a01',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000005',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000a01/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', NULL, 'archived: an admin cannot attach media to an existing message'
);
select test.login('grandma@fixture.test');
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000a02',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000a02/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501', NULL, 'archived: a grandparent cannot upload media'
);
select is(
  test.rows($$update public.media set caption = 'late caption' where id = 'b5000000-0000-4000-8000-000000000004'$$),
  0, 'archived: the uploader cannot edit their caption (0 rows)'
);
select test.login('noa@fixture.test');
select lives_ok(
  $$select public.mark_space_read('b3000000-0000-4000-8000-000000000004')$$,
  'archived: the owner can still mark the space read'
);
select isnt_empty(
  $$select 1 from public.media where space_id = 'b3000000-0000-4000-8000-000000000004'$$,
  'archived: the owner can still read media'
);

-- Deleted content: hidden from other viewers, visible to the author and admins.
select is_empty(
  $$select 1 from public.messages where id = 'b4000000-0000-4000-8000-000000000006'$$,
  'deleted: a child cannot see someone else''s deleted message in their own space'
);
select test.login('grandma@fixture.test');
select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000006'),
  'Grandma in Noa space', 'deleted: the author still reads their own deleted text'
);
select test.login('dad@fixture.test');
select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000006'),
  'Grandma in Noa space', 'deleted: an admin reads deleted text'
);

-- Unarchive restores admin moderation, and the restore path works.
select test.login('mom@fixture.test');
select public.unarchive_space('b3000000-0000-4000-8000-000000000004');
select is(
  test.rows($$update public.messages set deleted_at = null where id = 'b4000000-0000-4000-8000-000000000006'$$),
  1, 'after unarchive an admin can restore a deleted message'
);
select is(
  (select count(*)::int from public.audit_log where action = 'space.unarchived'),
  1, 'unarchive_space writes an audit row'
);
select test.login('grandma@fixture.test');
select throws_ok(
  $$select public.unarchive_space('b3000000-0000-4000-8000-000000000004')$$,
  '42501', NULL, 'a grandparent cannot unarchive'
);
select test.login('other@fixture.test');
select throws_ok(
  $$select public.unarchive_space('b3000000-0000-4000-8000-000000000004')$$,
  '42501', NULL, 'an admin of another family cannot unarchive'
);

-- Confirmed email is required.
reset role;
update auth.users set email_confirmed_at = null where email = 'cousin@fixture.test';
select test.login('mom@fixture.test');
select set_config(
  'test.unconfirmed_invite',
  public.create_invitation('b0000000-0000-4000-8000-000000000001', 'cousin@fixture.test', 'member', 'Cousin')::text,
  true
);
select test.login('cousin@fixture.test');
set local role authenticated;
select throws_ok(
  format('select public.accept_invite(%L)', current_setting('test.unconfirmed_invite')),
  '42501', NULL, 'accept_invite refuses an unconfirmed email'
);

-- Broadcast payload omits text and object keys.
select test.login('noa@fixture.test');
select public.mark_space_read('b3000000-0000-4000-8000-000000000004');
insert into public.messages (id, space_id, family_id, author_member_id, body, created_by)
values (
  'b4000000-0000-4000-8000-000000000a03',
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000005',
  'Secret broadcast text',
  'b1000000-0000-4000-8000-000000000005'
);
select test.login('grandma@fixture.test');
update public.media set caption = 'New caption' where id = 'b5000000-0000-4000-8000-000000000004';
reset role;
select is_empty(
  $$
    select 1
    from realtime.messages
    where payload::text like '%Secret broadcast text%'
       or payload::text like '%New caption%'
       or payload::text like '%original.jpg%'
  $$,
  'broadcasts carry no body, caption, or object key'
);
select is(
  (
    select count(distinct payload -> 'record' ->> 'id')::int
    from realtime.messages
    where topic = 'space:b3000000-0000-4000-8000-000000000004'
      and payload -> 'record' ->> 'id' in ('b4000000-0000-4000-8000-000000000a03', 'b5000000-0000-4000-8000-000000000004')
  ),
  2, 'the minimal notice still reaches the space topic for both tables'
);

-- Topic matching: a viewer subscribed to their own topic cannot read rows for another topic.
insert into realtime.messages (id, topic, extension, payload, event, private)
values ('b8000000-0000-4000-8000-000000000a01', 'space:b3000000-0000-4000-8000-000000000002', 'broadcast', '{}'::jsonb, 'INSERT', true);
select test.login('noa@fixture.test');
set local role authenticated;
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004', true);
select is_empty(
  $$select 1 from realtime.messages where id = 'b8000000-0000-4000-8000-000000000a01'$$,
  'topic match: a row for a parent topic is hidden while subscribed to the own topic'
);
select isnt_empty(
  $$select 1 from realtime.messages where topic = 'space:b3000000-0000-4000-8000-000000000004'$$,
  'topic match: rows for the subscribed topic stay readable'
);
select test.login('mom@fixture.test');
select set_config('realtime.topic', 'space:b3000000-0000-4000-8000-000000000004', true);
select is_empty(
  $$select 1 from realtime.messages where id = 'b8000000-0000-4000-8000-000000000a01'$$,
  'topic match: even an admin only reads rows for the topic they joined'
);

-- dblink is gone after the migration.
select is(
  (select count(*)::int from pg_extension where extname = 'dblink'),
  0, 'dblink is not installed after migrations'
);

-- Unread: own message plus someone else's attached media counts once.
select test.login('noa@fixture.test');
select is(
  (
    select unread_count::int
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000004'
  ),
  0, 'unread: the caller''s own new message is not unread'
);

reset role;
update public.spaces set archived_at = now() where id = 'b3000000-0000-4000-8000-000000000005';
select test.login('mom@fixture.test');
set local role authenticated;
select throws_ok(
  $$select public.rename_space('b3000000-0000-4000-8000-000000000005', 'Renamed while archived')$$,
  '42501', NULL, 'rename_space refuses an archived space until it is unarchived'
);

reset role;
update public.family_members set status = 'removed', removed_at = now() where id = 'b2000000-0000-4000-8000-000000000006';
insert into public.invitations (id, family_id, email, role, label, create_space, invited_by, expires_at)
values (
  'b6000000-0000-4000-8000-000000000a01',
  'b0000000-0000-4000-8000-000000000001',
  'ari@fixture.test', 'member', 'Ari', true, 'b1000000-0000-4000-8000-000000000001',
  now() + interval '3 days'
);
select test.login('ari@fixture.test');
set local role authenticated;
select public.accept_invite('b6000000-0000-4000-8000-000000000a01');
reset role;
select is(
  (
    select count(*)::int
    from public.audit_log
    where action = 'space.unarchived'
      and target = 'b3000000-0000-4000-8000-000000000005'
  ),
  1, 'reopening an archived space through accept_invite is audited as space.unarchived'
);

select test.login('stranger@fixture.test');
set local role authenticated;
select is(
  (select count(*)::int from private.space_viewer_member_ids('b3000000-0000-4000-8000-000000000001')),
  0, 'a stranger gets no member ids for another family''s space'
);

select * from finish();
rollback;
