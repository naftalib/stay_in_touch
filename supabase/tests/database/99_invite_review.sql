begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(57);

-- Token shape, hash storage, and column privileges
select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.invite_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    '  Cousin@Fixture.test  ',
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

select is(length(current_setting('test.token')), 43, 'token is 32 bytes of base64url');

select matches(
  current_setting('test.token'),
  '^[A-Za-z0-9_-]+$',
  'token alphabet is base64url'
);

reset role;

select is(
  (select i.email from public.invitations i where i.id = current_setting('test.invite_id')::uuid),
  'cousin@fixture.test',
  'invitation email is trimmed and lowercased'
);

select is(
  (
    select i.token_hash
    from public.invitations i
    where i.id = current_setting('test.invite_id')::uuid
  ),
  extensions.digest(current_setting('test.token'), 'sha256'),
  'only the sha-256 hash is stored'
);

select ok(
  not exists (
    select 1
    from public.audit_log al
    where al.action = 'invitation.sent'
      and al.target = current_setting('test.invite_id')
      and (
        al.details::text like '%' || current_setting('test.token') || '%'
        or al.details::text ilike '%token_hash%'
      )
  ),
  'invitation.sent audit does not contain the token or hash'
);

select is_empty(
  $$
    select privilege_type
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'invitations'
      and column_name = 'token_hash'
      and grantee in ('authenticated', 'anon', 'PUBLIC')
  $$,
  'token_hash is not granted to client roles'
);

select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  $$ select token_hash from public.invitations limit 1 $$,
  '42501',
  null,
  'authenticated cannot select token_hash'
);

-- Who may issue
select test.login('grandma@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.issue_invitation_token(%L)', current_setting('test.invite_id')),
  '42501',
  null,
  'a grandparent cannot issue a token'
);

select test.login('noa@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.issue_invitation_token(%L)', current_setting('test.invite_id')),
  '42501',
  null,
  'a child cannot issue a token'
);

select test.login('other@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.issue_invitation_token(%L)', current_setting('test.invite_id')),
  '42501',
  null,
  'an admin of another family cannot issue a token'
);

select throws_ok(
  format('select public.revoke_invitation(%L)', current_setting('test.invite_id')),
  '42501',
  null,
  'an admin of another family cannot revoke'
);

select is_empty(
  $$
    select id from public.invitations
    where family_id = 'b0000000-0000-4000-8000-000000000001'
  $$,
  'another family admin cannot read these invitations'
);

reset role;
update public.family_members
set status = 'removed', removed_at = pg_catalog.now()
where id = 'b2000000-0000-4000-8000-000000000001';

select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  $$
    select public.create_invitation(
      'b0000000-0000-4000-8000-000000000001',
      'removed-admin@fixture.test',
      'grandparent',
      'Removed',
      false,
      now() + interval '1 day'
    )
  $$,
  '42501',
  null,
  'a removed admin cannot create an invitation'
);

reset role;
update public.family_members
set status = 'active', removed_at = null
where id = 'b2000000-0000-4000-8000-000000000001';

-- Rate limit, rotation, expiry renewal
select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.issue_invitation_token(%L)', current_setting('test.invite_id')),
  '22023',
  'please wait a minute before sending again',
  'a second send inside 60 seconds is rejected'
);

reset role;
update public.invitations
set last_sent_at = pg_catalog.now() - interval '2 minutes',
    expires_at = pg_catalog.now() + interval '1 day'
where id = current_setting('test.invite_id')::uuid;

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.token2',
  (select t.token from public.issue_invitation_token(current_setting('test.invite_id')::uuid) t),
  true
);

select isnt(
  current_setting('test.token2'),
  current_setting('test.token'),
  'resend rotates the token'
);

reset role;

select ok(
  (
    select expires_at > pg_catalog.now() + interval '13 days'
    from public.invitations
    where id = current_setting('test.invite_id')::uuid
  ),
  'resend renews expiry to about 14 days'
);

set local role anon;

select is_empty(
  format('select * from public.invitation_preview(%L)', current_setting('test.token')),
  'rotated token previews as unknown'
);

select is(
  (select p.status from public.invitation_preview(current_setting('test.token2')) p),
  'pending',
  'anon preview of the current token is pending'
);

select ok(
  pg_get_function_result('public.invitation_preview(text)'::regprocedure) not like '%family_id%'
  and pg_get_function_result('public.invitation_preview(text)'::regprocedure) not like '%user_id%',
  'preview result has no ids'
);

-- Daily cap
reset role;
insert into public.audit_log (family_id, actor_user_id, action, target, details)
select
  'b0000000-0000-4000-8000-000000000001',
  null,
  'invitation.sent',
  current_setting('test.invite_id'),
  '{"send_count": 1}'::jsonb
from generate_series(1, 4);

update public.invitations
set last_sent_at = pg_catalog.now() - interval '2 minutes'
where id = current_setting('test.invite_id')::uuid;

select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.issue_invitation_token(%L)', current_setting('test.invite_id')),
  '22023',
  'too many emails for this invitation today',
  'five sends in a day are rejected'
);

-- Preview statuses and accept rules on a fresh invitation
reset role;
select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.fresh_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'late@fixture.test',
    'member',
    'Late',
    true,
    now() + interval '3 days'
  )::text,
  true
);

reset role;
update public.invitations
set last_sent_at = null
where id = current_setting('test.fresh_id')::uuid;

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.fresh_token',
  (select t.token from public.issue_invitation_token(current_setting('test.fresh_id')::uuid) t),
  true
);

reset role;
update public.invitations
set expires_at = pg_catalog.now()
where id = current_setting('test.fresh_id')::uuid;

set local role anon;
select is(
  (select p.status from public.invitation_preview(current_setting('test.fresh_token')) p),
  'expired',
  'expires_at = now() previews as expired'
);

select test.login('late@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.fresh_token')),
  '42501',
  'invitation has expired',
  'an expired token cannot be accepted'
);

reset role;
update public.invitations
set expires_at = pg_catalog.now() + interval '3 days',
    last_sent_at = pg_catalog.now() - interval '2 minutes'
where id = current_setting('test.fresh_id')::uuid;

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.fresh_token',
  (select t.token from public.issue_invitation_token(current_setting('test.fresh_id')::uuid) t),
  true
);

select test.login('grandpa@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.fresh_token')),
  '42501',
  'invitation not found',
  'the wrong account cannot accept'
);

select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.fresh_token')),
  '42501',
  'invitation not found',
  'Mom cannot accept an invitation for a different email'
);

-- The previous call used Mom against Late's invite (wrong email). Now the plus-alias case:
reset role;
select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.alias_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'mom+noa@fixture.test',
    'member',
    'Noa Alias',
    true,
    now() + interval '2 days'
  )::text,
  true
);

reset role;
update public.invitations
set last_sent_at = null
where id = current_setting('test.alias_id')::uuid;

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.alias_token',
  (select t.token from public.issue_invitation_token(current_setting('test.alias_id')::uuid) t),
  true
);

select throws_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.alias_token')),
  '42501',
  'invitation not found',
  'Mom cannot accept an invitation addressed to mom+noa'
);

-- Unconfirmed email
reset role;
update auth.users
set email_confirmed_at = null
where email = 'late@fixture.test';

select test.login('late@fixture.test');
set local role authenticated;

select throws_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.fresh_token')),
  '42501',
  'sign in required',
  'an unconfirmed email cannot accept'
);

reset role;
update auth.users
set email_confirmed_at = pg_catalog.now(),
    email = 'Late@Fixture.test'
where id = 'b1000000-0000-4000-8000-00000000000c';

select test.login('Late@Fixture.test');
set local role authenticated;

select lives_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.fresh_token')),
  'accept matches a confirmed email that differs only by case'
);

select is(
  (
    select fm.role::text
    from public.family_members fm
    where fm.user_id = 'b1000000-0000-4000-8000-00000000000c'
      and fm.family_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  'member',
  'the role comes from the invitation'
);

select ok(
  exists (
    select 1
    from public.spaces s
    join public.family_members fm on fm.id = s.owner_member_id
    where fm.user_id = 'b1000000-0000-4000-8000-00000000000c'
      and s.archived_at is null
  ),
  'create_space opens a space'
);

select throws_ok(
  format('select * from public.accept_invitation(%L)', current_setting('test.fresh_token')),
  '42501',
  null,
  'the same token cannot be accepted twice'
);

set local role anon;
select is(
  (select p.status from public.invitation_preview(current_setting('test.fresh_token')) p),
  'accepted',
  'preview of an accepted token says accepted'
);

-- my_pending_invitations
select test.login('stranger@fixture.test');
set local role authenticated;

select is_empty(
  $$ select * from public.my_pending_invitations() $$,
  'my_pending_invitations hides other people'
);

reset role;
update auth.users set email_confirmed_at = null where email = 'stranger@fixture.test';

select test.login('stranger@fixture.test');
set local role authenticated;

select is_empty(
  $$ select * from public.my_pending_invitations() $$,
  'an unconfirmed account sees no pending invitations'
);

reset role;
update auth.users set email_confirmed_at = pg_catalog.now() where email = 'stranger@fixture.test';

-- Second family
select test.login('other@fixture.test');
set local role authenticated;

select set_config(
  'test.second_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000002',
    'grandma@fixture.test',
    'grandparent',
    'Grandma',
    false,
    now() + interval '4 days'
  )::text,
  true
);

select test.login('grandma@fixture.test');
set local role authenticated;

select lives_ok(
  format('select public.accept_invite(%L)', current_setting('test.second_id')),
  'an existing member can join a second family'
);

select is(
  (
    select fm.role::text
    from public.family_members fm
    where fm.user_id = 'b1000000-0000-4000-8000-000000000003'
      and fm.family_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  'grandparent',
  'joining a second family does not change the first'
);

select is(
  (select count(*) from public.my_pending_invitations()),
  0::bigint,
  'an accepted invite leaves my_pending_invitations'
);

-- Re-invite restores the invitation role and reopens the space
select test.login('mom@fixture.test');
set local role authenticated;

select lives_ok(
  $$
    select public.remove_member((
      select id from public.family_members
      where user_id = 'b1000000-0000-4000-8000-00000000000c'
        and family_id = 'b0000000-0000-4000-8000-000000000001'
    ))
  $$,
  'remove_member removes the new member'
);

reset role;
select ok(
  (
    select s.archived_at is not null
    from public.spaces s
    join public.family_members fm on fm.id = s.owner_member_id
    where fm.user_id = 'b1000000-0000-4000-8000-00000000000c'
  ),
  'remove_member archives the owned space'
);

select ok(
  exists (
    select 1
    from public.audit_log
    where action = 'space.archived'
      and details ->> 'via' = 'remove_member'
  ),
  'archiving via remove_member is audited'
);

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.reinvite_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'late@fixture.test',
    'admin',
    'Late',
    false,
    now() + interval '4 days'
  )::text,
  true
);

select test.login('Late@Fixture.test');
set local role authenticated;

select lives_ok(
  format('select public.accept_invite(%L)', current_setting('test.reinvite_id')),
  'a removed member can accept a new invitation'
);

select is(
  (
    select role::text
    from public.family_members
    where user_id = 'b1000000-0000-4000-8000-00000000000c'
      and family_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  'admin',
  're-invite uses the new invitation role'
);

reset role;
select ok(
  (
    select s.archived_at is null
    from public.spaces s
    join public.family_members fm on fm.id = s.owner_member_id
    where fm.user_id = 'b1000000-0000-4000-8000-00000000000c'
  ),
  're-invite reopens the archived space'
);

-- Revoke clears the hash
select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.revoke_id',
  public.create_invitation(
    'b0000000-0000-4000-8000-000000000001',
    'revoked-link@fixture.test',
    'grandparent',
    'Stranger',
    false,
    now() + interval '2 days'
  )::text,
  true
);

reset role;
update public.invitations set last_sent_at = null
where id = current_setting('test.revoke_id')::uuid;

select test.login('mom@fixture.test');
set local role authenticated;

select set_config(
  'test.revoke_token',
  (select t.token from public.issue_invitation_token(current_setting('test.revoke_id')::uuid) t),
  true
);

select lives_ok(
  format('select public.revoke_invitation(%L)', current_setting('test.revoke_id')),
  'admin can revoke'
);

reset role;
select ok(
  (
    select token_hash is not null and status = 'revoked'
    from public.invitations
    where id = current_setting('test.revoke_id')::uuid
  ),
  'revoke keeps the hash and marks the invite revoked'
);

set local role anon;
select is(
  (
    select p.status
    from public.invitation_preview(current_setting('test.revoke_token')) p
  ),
  'revoked',
  'a revoked token previews as revoked'
);

select test.login('mom@fixture.test');
set local role authenticated;

select throws_ok(
  $$
    select public.create_invitation(
      'b0000000-0000-4000-8000-000000000001',
      'gp-space@fixture.test',
      'grandparent',
      'Space',
      true,
      now() + interval '1 day'
    )
  $$,
  '22023',
  'grandparents do not get a space',
  'a grandparent invitation cannot create a space'
);

-- Private helpers are not client-executable
reset role;
select ok(
  not has_function_privilege(
    'authenticated',
    'private.finish_accept_invitation(public.invitations, uuid)',
    'execute'
  ),
  'authenticated cannot execute finish_accept_invitation'
);

select ok(
  not has_function_privilege('anon', 'private.cleanup_orphan_invite_auth_users()', 'execute'),
  'anon cannot execute orphan cleanup'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.cleanup_orphan_invite_auth_users()',
    'execute'
  ),
  'authenticated cannot execute orphan cleanup'
);

-- Orphan cleanup
select test.seed_user('b1000000-0000-4000-8000-0000000000d1', 'orphan@fixture.test', 'Orphan');
select test.seed_user('b1000000-0000-4000-8000-0000000000d2', 'signedin@fixture.test', 'Signed In');
select test.seed_user('b1000000-0000-4000-8000-0000000000d3', 'stillpending@fixture.test', 'Still Pending');

update auth.users
set last_sign_in_at = pg_catalog.now()
where email = 'signedin@fixture.test';

insert into public.invitations (family_id, email, role, label, create_space, invited_by, status, expires_at)
values
  ('b0000000-0000-4000-8000-000000000001', 'orphan@fixture.test', 'grandparent', 'Orphan', false, 'b1000000-0000-4000-8000-000000000001', 'revoked', now() + interval '1 day'),
  ('b0000000-0000-4000-8000-000000000001', 'signedin@fixture.test', 'grandparent', 'Signed', false, 'b1000000-0000-4000-8000-000000000001', 'revoked', now() + interval '1 day'),
  ('b0000000-0000-4000-8000-000000000001', 'stillpending@fixture.test', 'grandparent', 'Pending', false, 'b1000000-0000-4000-8000-000000000001', 'revoked', now() + interval '1 day'),
  ('b0000000-0000-4000-8000-000000000001', 'stillpending@fixture.test', 'grandparent', 'Pending', false, 'b1000000-0000-4000-8000-000000000001', 'pending', now() + interval '2 days'),
  ('b0000000-0000-4000-8000-000000000001', 'uncle@fixture.test', 'member', 'Uncle', false, 'b1000000-0000-4000-8000-000000000001', 'revoked', now() + interval '1 day'),
  ('b0000000-0000-4000-8000-000000000001', 'mom@fixture.test', 'admin', 'Mom', false, 'b1000000-0000-4000-8000-000000000001', 'expired', now() - interval '1 day');

select is(
  private.cleanup_orphan_invite_auth_users(),
  1,
  'cleanup deletes only the never-signed-in orphan'
);

select ok(
  not exists (select 1 from auth.users where email = 'orphan@fixture.test'),
  'the orphan auth user is gone'
);

select ok(
  exists (select 1 from auth.users where email = 'signedin@fixture.test'),
  'cleanup keeps a user who has signed in'
);

select ok(
  exists (select 1 from auth.users where email = 'stillpending@fixture.test'),
  'cleanup keeps a user with another pending invitation'
);

select ok(
  exists (select 1 from auth.users where email = 'uncle@fixture.test'),
  'cleanup keeps a removed member'
);

select ok(
  exists (select 1 from auth.users where email = 'mom@fixture.test'),
  'cleanup keeps an active member'
);

select is(
  private.cleanup_orphan_invite_auth_users(),
  0,
  'cleanup is idempotent'
);

select ok(
  exists (
    select 1
    from public.audit_log
    where action = 'auth_user.deleted'
      and details ->> 'via' = 'orphan_invite_cleanup'
      and details::text not like '%token%'
  ),
  'cleanup writes an audit row without a token'
);

select * from finish();
rollback;
