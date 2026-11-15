-- Photos: bucket, reserve, post, visibility, unread, orphans, provider.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(41);

select is(
  (select public from storage.buckets where id = 'photos'),
  false,
  'the photos bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'photos'),
  5242880::bigint,
  'the photos bucket allows 5 MB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'photos'),
  array['image/jpeg']::text[],
  'the photos bucket allows JPEG only'
);

reset role;
insert into storage.objects (bucket_id, name)
values ('photos', 'secret.jpg');

set local role anon;
select is_empty(
  $$select 1 from storage.objects where bucket_id = 'photos'$$,
  'anon cannot select objects in the photos bucket'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('photos', 'anon.jpg')$$,
  '42501', null,
  'anon cannot insert into the photos bucket'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'photos'$$,
  '42501', null,
  'anon cannot delete photos objects'
);

set local role authenticated;
select is_empty(
  $$select 1 from storage.objects where bucket_id = 'photos'$$,
  'authenticated cannot select objects in the photos bucket'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('photos', 'user.jpg')$$,
  '42501', null,
  'authenticated cannot insert into the photos bucket'
);
select lives_ok(
  $$update storage.objects set metadata = '{"x":1}' where bucket_id = 'photos'$$,
  'an authenticated update is accepted by SQL and hidden by RLS'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'photos'$$,
  '42501', null,
  'authenticated cannot delete photos objects'
);

reset role;
select is(
  (select metadata from storage.objects where name = 'secret.jpg'),
  null,
  'the hidden update did not change the stored object'
);

-- Poster rules.
select test.login('grandma@fixture.test');
set local role authenticated;
select isnt_empty(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000004', 100, 40, 800, 600, 'Picnic'
  )$$,
  'a grandparent can reserve a photo in Noa''s space'
);

select test.login('noa@fixture.test');
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000005', 100, 40, 800, 600, null
  )$$,
  '42501', null,
  'Noa cannot reserve a photo in Ari''s space'
);

reset role;
update public.spaces
set archived_at = now()
where id = 'b3000000-0000-4000-8000-000000000003';

select test.login('dad@fixture.test');
set local role authenticated;
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000003', 100, 40, 800, 600, null
  )$$,
  '42501', null,
  'an archived space rejects a reservation'
);

select test.login('uncle@fixture.test');
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000001', 100, 40, 800, 600, null
  )$$,
  '42501', null,
  'a removed member cannot reserve a photo'
);

select test.login('other@fixture.test');
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000004', 100, 40, 800, 600, null
  )$$,
  '42501', null,
  'another family cannot reserve a photo here'
);

select test.login('grandma@fixture.test');
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000004', 5242881, 40, 800, 600, null
  )$$,
  '22023', null,
  'a file over 5 MB is rejected'
);
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000004', 100, 40, 2049, 10, null
  )$$,
  '22023', null,
  'a long edge over 2048 is rejected'
);

select ok(
  exists (
    select 1 from pg_locks
    where locktype = 'advisory' and objid = 83427601 and granted
  ),
  'reserve holds the app-wide lock for the rest of the transaction'
);

-- Video cannot be posted through the photo RPC.
reset role;
insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, width, height, size_bytes
) values (
  'b5000000-0000-4000-8000-0000000000aa',
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000003',
  'video',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-0000000000aa/original.mp4',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-0000000000aa/thumb.jpg',
  'video/mp4', 'ready', 'r2',
  'b1000000-0000-4000-8000-000000000003',
  640, 480, 100
);

select test.login('grandma@fixture.test');
set local role authenticated;
select throws_ok(
  $$select public.post_message_with_photos(
    'b3000000-0000-4000-8000-000000000004',
    'a clip',
    array['b5000000-0000-4000-8000-0000000000aa']::uuid[],
    null
  )$$,
  '42501', null,
  'a video row cannot be posted with the photo RPC'
);

-- Daily cap counts failed rows.
reset role;
insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, expected_bytes, expected_thumb_bytes
)
select
  id,
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000003',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/' || id || '/original.jpg',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/' || id || '/thumb.jpg',
  'image/jpeg', 'failed', 'r2',
  'b1000000-0000-4000-8000-000000000003',
  10, 10
from (select gen_random_uuid() as id from generate_series(1, 99)) ids;

select test.login('grandma@fixture.test');
set local role authenticated;
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000004', 100, 40, 800, 600, null
  )$$,
  '22023', null,
  'the 101st photo in a day is rejected and failed uploads count'
);

reset role;
delete from public.media
where uploader_member_id = 'b2000000-0000-4000-8000-000000000003'
  and status = 'failed';

insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, size_bytes, expected_thumb_bytes, width, height
) values (
  'b5000000-0000-4000-8000-0000000000bb',
  'b3000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000bb/original.jpg',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000bb/thumb.jpg',
  'image/jpeg', 'ready', 'supabase',
  'b1000000-0000-4000-8000-000000000001',
  838860000, 800, 100, 100
);

select test.login('mom@fixture.test');
set local role authenticated;
select throws_ok(
  $$select * from public.reserve_photo_upload(
    'b3000000-0000-4000-8000-000000000001', 100, 40, 80, 80, null
  )$$,
  '22023', null,
  'a reservation that would cross 800 MB is rejected'
);

reset role;
delete from public.media where id = 'b5000000-0000-4000-8000-0000000000bb';

-- Posting rules. Mark the picnic reservation ready, then reject the bad cases.
select public.mark_media_ready(
  (select id from public.media where caption = 'Picnic'),
  100, 40, 'supabase'
);

select test.login('grandma@fixture.test');
set local role authenticated;
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      '',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  '23514', null,
  'a direct blank message still fails'
);

select throws_ok(
  $$select public.post_message_with_photos(
    'b3000000-0000-4000-8000-000000000004', '', array[]::uuid[], null
  )$$,
  '22023', null,
  'posting with no photos is rejected'
);

select isnt(
  public.post_message_with_photos(
    'b3000000-0000-4000-8000-000000000004',
    '',
    array[(select id from public.media where caption = 'Picnic')]::uuid[],
    null
  ),
  null,
  'a blank message is allowed when a ready photo is attached'
);

select throws_ok(
  $$select public.post_message_with_photos(
    'b3000000-0000-4000-8000-000000000004',
    'again',
    array[(select id from public.media where caption = 'Picnic')]::uuid[],
    null
  )$$,
  '42501', null,
  'a photo can be attached only once'
);

select test.login('noa@fixture.test');
select is_empty(
  $$select 1 from public.media where caption = 'Picnic' and status = 'pending'$$,
  'a pending upload is not visible to another member'
);

reset role;
insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, width, height
) values (
  'b5000000-0000-4000-8000-0000000000cc',
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000003',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-0000000000cc/original.jpg',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-0000000000cc/thumb.jpg',
  'image/jpeg', 'pending', 'r2',
  'b1000000-0000-4000-8000-000000000003',
  10, 10
);

select test.login('noa@fixture.test');
set local role authenticated;
select is_empty(
  $$select 1 from public.media where id = 'b5000000-0000-4000-8000-0000000000cc'$$,
  'pending media is hidden from everyone except the uploader'
);
select test.login('grandma@fixture.test');
select isnt_empty(
  $$select 1 from public.media where id = 'b5000000-0000-4000-8000-0000000000cc'$$,
  'the uploader can see their pending photo'
);

-- Unread: one message with three ready photos counts as one item. Pending does not.
select test.login('noa@fixture.test');
set local role authenticated;
select lives_ok(
  $$select set_config('test.unread_before', coalesce((
    select unread_count::text
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000004'
  ), '0'), true)$$,
  'remember Noa''s unread count before the photo post'
);

reset role;
insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, width, height
)
select
  id,
  'b3000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000003',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/' || id || '/original.jpg',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/' || id || '/thumb.jpg',
  'image/jpeg', 'ready', 'supabase',
  'b1000000-0000-4000-8000-000000000003',
  80, 80
from (
  values
    ('b5000000-0000-4000-8000-0000000000c1'::uuid),
    ('b5000000-0000-4000-8000-0000000000c2'::uuid),
    ('b5000000-0000-4000-8000-0000000000c3'::uuid)
) as ids(id);

select test.login('grandma@fixture.test');
set local role authenticated;
select lives_ok(
  $$select public.post_message_with_photos(
    'b3000000-0000-4000-8000-000000000004',
    'Three photos',
    array[
      'b5000000-0000-4000-8000-0000000000c1',
      'b5000000-0000-4000-8000-0000000000c2',
      'b5000000-0000-4000-8000-0000000000c3'
    ]::uuid[],
    null
  )$$,
  'three ready photos post as one message'
);

select test.login('noa@fixture.test');
select is(
  (
    select unread_count
    from public.unread_counts('b0000000-0000-4000-8000-000000000001')
    where space_id = 'b3000000-0000-4000-8000-000000000004'
  ),
  current_setting('test.unread_before')::bigint + 1,
  'three photos on one new message count as one unread item'
);

-- Service RPCs.
select throws_ok(
  $$select public.mark_media_ready(
    'b5000000-0000-4000-8000-0000000000cc', 10, 10, 'supabase'
  )$$,
  '42501', null,
  'authenticated cannot mark media ready'
);
select throws_ok(
  $$select public.list_photo_orphans()$$,
  '42501', null,
  'authenticated cannot list photo orphans'
);

set local role anon;
select throws_ok(
  $$select public.mark_media_failed('b5000000-0000-4000-8000-0000000000cc')$$,
  '42501', null,
  'anon cannot mark media failed'
);

reset role;
select lives_ok(
  $$insert into public.media (
    id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, status, provider, created_by
  ) values (
    'b5000000-0000-4000-8000-0000000000dd',
    'b3000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'photo',
    'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000dd/original.jpg',
    'image/jpeg', 'ready', 'b2',
    'b1000000-0000-4000-8000-000000000001'
  )$$,
  'provider b2 is accepted'
);
select throws_ok(
  $$insert into public.media (
    id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, status, provider, created_by
  ) values (
    'b5000000-0000-4000-8000-0000000000ee',
    'b3000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
    'photo',
    'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000ee/original.jpg',
    'image/jpeg', 'ready', 'nope',
    'b1000000-0000-4000-8000-000000000001'
  )$$,
  '22P02', null,
  'an unknown provider is rejected'
);

-- Orphans: old pending and old unattached ready are selected. Attached and recent are not.
insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, created_at
) values (
  'b5000000-0000-4000-8000-0000000000c0',
  'b3000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000c0/original.jpg',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000c0/thumb.jpg',
  'image/jpeg', 'pending', 'r2',
  'b1000000-0000-4000-8000-000000000001',
  now() - interval '25 hours'
);

insert into public.media (
  id, space_id, family_id, uploader_member_id, kind, r2_key, thumb_key,
  content_type, status, provider, created_by, created_at
) values (
  'b5000000-0000-4000-8000-0000000000ff',
  'b3000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'photo',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000ff/original.jpg',
  'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-0000000000ff/thumb.jpg',
  'image/jpeg', 'ready', 'supabase',
  'b1000000-0000-4000-8000-000000000001',
  now() - interval '25 hours'
);

select ok(
  exists (select 1 from public.list_photo_orphans() where media_id = 'b5000000-0000-4000-8000-0000000000c0'),
  'a pending photo older than a day is an orphan'
);
select ok(
  exists (select 1 from public.list_photo_orphans() where media_id = 'b5000000-0000-4000-8000-0000000000ff'),
  'an unattached ready photo older than a day is an orphan'
);
select ok(
  not exists (
    select 1 from public.list_photo_orphans()
    where media_id = (select id from public.media where caption = 'Picnic')
  ),
  'an attached photo is kept'
);
select ok(
  not exists (
    select 1 from public.list_photo_orphans()
    where media_id = 'b5000000-0000-4000-8000-000000000001'
  ),
  'a recent ready photo is kept'
);

select * from finish();
rollback;
