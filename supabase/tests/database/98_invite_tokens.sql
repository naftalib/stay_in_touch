begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(18);

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.invite_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'cousin@fixture.test',
    'grandparent',
    'Cousin',
    false,
    now() + interval '2 days'
  )::text,
  true
);

select set_config(
  'test.token',
  (select t.token from public.issue_invitation_token(current_setting('test.invite_id')::uuid) t),
  true
);

select isnt(
  current_setting('test.token', true),
  '',
  'issue_invitation_token returns a token for a family admin'
);

select test.login('other@fixture.test');
set local role authenticated;

select throws_ok(
  format(
    'select * from public.issue_invitation_token(%L)',
    current_setting('test.invite_id')
  ),
  '42501',
  NULL,
  'another family admin cannot issue a token'
);

select test.login('mom@fixture.test');
set local role authenticated;

update public.invitations
set last_sent_at = pg_catalog.now() - interval '2 minutes'
where id = current_setting('test.invite_id')::uuid;

select set_config(
  'test.token2',
  (select t.token from public.issue_invitation_token(current_setting('test.invite_id')::uuid) t),
  true
);

select isnt(
  current_setting('test.token2', true),
  current_setting('test.token', true),
  're-issue rotates the token'
);

reset role;
set local role anon;

select is(
  (select p.status from public.invitation_preview(current_setting('test.token2')) p),
  'pending',
  'invitation_preview works for anon'
);

select is_empty(
  format(
    $$ select * from public.invitation_preview(%L) $$,
    current_setting('test.token')
  ),
  'old token no longer previews'
);

update public.invitations
set last_sent_at = pg_catalog.now() - interval '2 minutes'
where id = current_setting('test.invite_id')::uuid;

select test.login('cousin@fixture.test');
set local role authenticated;

select lives_ok(
  format(
    $$ select * from public.accept_invitation(%L) $$,
    current_setting('test.token2')
  ),
  'accept_invitation works for the invited email'
);

select test.login('ari@fixture.test');
set local role authenticated;

select throws_ok(
  format(
    $$ select public.issue_invitation_token(%L) $$,
    current_setting('test.invite_id')
  ),
  '42501',
  NULL,
  'child cannot issue invitation tokens'
);

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.remove_id',
  'b2000000-0000-4000-8000-000000000006',
  true
);

select lives_ok(
  format('select public.remove_member(%L)', current_setting('test.remove_id')),
  'remove_member archives owned space via admin action'
);

select isnt(
  (
    select s.archived_at
    from public.spaces s
    join public.family_members fm on fm.id = s.owner_member_id
    where fm.id = current_setting('test.remove_id')::uuid
  ),
  NULL::timestamptz,
  'owned space is archived after remove_member'
);

select throws_ok(
  $$ select token_hash from public.invitations limit 1 $$,
  NULL,
  NULL,
  'token_hash is not selectable by authenticated'
);

select test.login('cousin@fixture.test');
set local role authenticated;

select is_empty(
  $$ select * from public.my_pending_invitations() $$,
  'my_pending_invitations returns nothing after accept'
);

select test.login('stranger@fixture.test');
set local role authenticated;

select is_empty(
  $$ select * from public.my_pending_invitations() $$,
  'my_pending_invitations never returns another persons invite'
);

select * from finish();
rollback;