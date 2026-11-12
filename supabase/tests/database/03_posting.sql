begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(12);

select test.login('noa@fixture.test');
set local role authenticated;

select lives_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'Noa in General',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  'child can post in General'
);

select lives_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'Noa in her space',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  'child can post in their own space'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000005',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'Noa in Ari space',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '23503',
  NULL,
  'child cannot post in a sibling space'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000002',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'Noa in Mom space',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '23503',
  NULL,
  'child cannot post in a parent space'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000011',
      'b0000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000005',
      'Noa in the other family',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '23503',
  NULL,
  'child cannot post in another family'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'Pretending to be Mom',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '42501',
  NULL,
  'a child cannot post as someone else'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000005',
      'Wrong family',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '23514',
  NULL,
  'family_id must match the space'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, reply_to_id, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000005',
      'Bad reply',
      'b4000000-0000-4000-8000-000000000003',
      'b1000000-0000-4000-8000-000000000005'
    )
  $$,
  '23514',
  NULL,
  'cannot quote-reply to a message in another space'
);

select test.login('grandma@fixture.test');

select lives_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'Grandma writes to Noa',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'grandparent can post in a child space'
);

select lives_ok(
  $$
    insert into public.media (
      id, space_id, family_id, uploader_member_id, kind, r2_key, content_type, created_by
    )
    values (
      'b5000000-0000-4000-8000-000000000099',
      'b3000000-0000-4000-8000-000000000004',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000003',
      'photo',
      'f/b0000000-0000-4000-8000-000000000001/s/b3000000-0000-4000-8000-000000000004/b5000000-0000-4000-8000-000000000099/original.jpg',
      'image/jpeg',
      'b1000000-0000-4000-8000-000000000003'
    )
  $$,
  'grandparent can upload media in a child space'
);

select test.login('mom@fixture.test');

select lives_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000005',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'Mom writes in Ari space',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  'admin can post in a member space'
);

select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000011',
      'b0000000-0000-4000-8000-000000000002',
      'b2000000-0000-4000-8000-000000000001',
      'Mom in the other family',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '23503',
  NULL,
  'admin cannot post in another family'
);

select * from finish();
rollback;
