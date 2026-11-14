-- Review: edit and delete with row counts and re-reads, media edit rules,
-- immutable columns, and insert-time integrity.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(28);

-- Authors: allow cases checked by row count and re-read.
select test.login('noa@fixture.test');
set local role authenticated;

select is(
  test.rows($$update public.messages set body = 'Noa edited' where id = 'b4000000-0000-4000-8000-000000000005'$$),
  1, 'author edit affects exactly one row'
);
select ok(
  (select body = 'Noa edited' and edited_at is not null from public.messages where id = 'b4000000-0000-4000-8000-000000000005'),
  'author edit is stored and sets edited_at'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000005'$$),
  1, 'author soft-delete affects exactly one row'
);
select is(
  test.rows($$update public.messages set body = 'Noa rewrites Grandma' where id = 'b4000000-0000-4000-8000-000000000006'$$),
  0, 'child cannot edit a grandparent message in the child''s own space (0 rows)'
);

-- Media: uploader edits and deletes their own; status and file fields are server-owned.
select test.login('grandma@fixture.test');

select is(
  test.rows($$update public.media set caption = 'Grandma caption' where id = 'b5000000-0000-4000-8000-000000000004'$$),
  1, 'uploader can edit their own caption'
);
select is(
  test.rows($$update public.media set deleted_at = now() where id = 'b5000000-0000-4000-8000-000000000004'$$),
  1, 'uploader can soft-delete their own media'
);
select throws_ok(
  $$update public.media set status = 'failed' where id = 'b5000000-0000-4000-8000-000000000004'$$,
  '42501', NULL, 'uploader cannot change media status'
);
select throws_ok(
  $$update public.media set r2_key = r2_key where id = 'b5000000-0000-4000-8000-000000000004'$$,
  '42501', NULL, 'uploader cannot rewrite r2_key'
);

-- Admin: soft-delete anyone's media, never edit its caption.
select test.login('mom@fixture.test');

select is(
  test.rows($$update public.media set deleted_at = now() where id = 'b5000000-0000-4000-8000-000000000005'$$),
  1, 'admin can soft-delete a child''s media'
);
select throws_ok(
  $$update public.media set caption = 'Admin caption' where id = 'b5000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'admin cannot change someone else''s caption'
);
select is(
  test.rows($$update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000007'$$),
  1, 'admin can soft-delete a child''s message'
);
select is(
  (select body from public.messages where id = 'b4000000-0000-4000-8000-000000000007'),
  'Ari space', 'admin soft-delete leaves the body untouched'
);
select throws_ok(
  $$delete from public.media where id = 'b5000000-0000-4000-8000-000000000005'$$,
  '42501', NULL, 'no role can hard-delete media'
);
select throws_ok(
  $$update public.media set space_id = 'b3000000-0000-4000-8000-000000000001' where id = 'b5000000-0000-4000-8000-000000000002'$$,
  '42501', NULL, 'nobody can move media to another space'
);
select throws_ok(
  $$update public.messages set author_member_id = 'b2000000-0000-4000-8000-000000000002' where id = 'b4000000-0000-4000-8000-000000000003'$$,
  '42501', NULL, 'nobody can change a message author'
);
select throws_ok(
  $$update public.messages set created_at = now() - interval '1 year' where id = 'b4000000-0000-4000-8000-000000000003'$$,
  '42501', NULL, 'nobody can change created_at'
);

-- Insert integrity.
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'Wrong created_by',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501', NULL, 'created_by must be the caller'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'Admin posting as Grandma',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', NULL, 'an admin cannot post as another member'
);
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000092',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000092/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', NULL, 'an admin cannot upload as another member'
);
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000093',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000001',
      'photo',
      'f/b0000000-0000-4000-8000-000000000002/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000093/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514', NULL, 'media family_id must match its space'
);
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, message_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000094',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000003',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000094/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514', NULL, 'media message_id must be in the same space'
);
select throws_ok(
  $$
    insert into public.media (id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by)
    values (
      'b5000000-0000-4000-8000-000000000095',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'photo',
      'f/b0000000-0000-4000-8000-000000000002/s/b3000000-0000-4000-8000-000000000011/b5000000-0000-4000-8000-000000000006/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514', NULL, 'media r2_key cannot point at another family''s object'
);

reset role;
update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000006';
select test.login('grandma@fixture.test');
set local role authenticated;
select is(
  test.rows($$update public.messages set deleted_at = null where id = 'b4000000-0000-4000-8000-000000000006'$$),
  0, 'an author cannot restore a post an admin deleted'
);
select is(
  test.rows($$update public.messages set body = 'Edited while deleted' where id = 'b4000000-0000-4000-8000-000000000006'$$),
  0, 'an author cannot edit a post after it was deleted'
);

select throws_ok(
  $$
    insert into public.media (
      id, space_id, family_id, uploader_member_id, kind, r2_key, content_type,
      status, provider, provider_asset_id, size_bytes, created_by
    )
    values (
      'b5000000-0000-4000-8000-000000000096',
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'video',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000096/original.mp4',
      'video/mp4',
      'ready', 'mux', 'someone-elses-mux-asset', 1,
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501', NULL, 'a client cannot insert media as ready, on mux, with a chosen asset id'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, edited_at, deleted_at, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'Born edited and deleted',
      now() - interval '1 year', now() + interval '1 year',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  '42501', NULL, 'a client cannot insert a message with edited_at or deleted_at preset'
);

select test.login('noa@fixture.test');
select throws_ok(
  $$
    update public.profiles
    set avatar_key = 'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000002/b5000000-0000-4000-8000-000000000002/original.jpg'
    where id = 'b1000000-0000-4000-8000-000000000005'
  $$,
  '23514', NULL, 'a child cannot point their avatar at a parent-space photo'
);

reset role;
update public.messages set deleted_at = now() where id = 'b4000000-0000-4000-8000-000000000001';
select test.login('noa@fixture.test');
set local role authenticated;
select is_empty(
  $$select 1 from public.messages where id = 'b4000000-0000-4000-8000-000000000001' and deleted_at is not null and body is not null$$,
  'a child cannot read the body of someone else''s soft-deleted message'
);

select * from finish();
rollback;
