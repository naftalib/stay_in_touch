-- Review: accept_invite edge cases, role escalation, last-admin guard, audit
-- rows for every admin RPC, and catalog-wide grant and policy checks.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc
\ir _review_helpers.sql.inc

select plan(28);

-- Catalog checks.
select is_empty(
  $$select table_name from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC')$$,
  'anon and PUBLIC have no table grants in public'
);
select is_empty(
  $$
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('anon', p.oid, 'execute')
  $$,
  'anon cannot execute any public or private function'
);
select is_empty(
  $$
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not coalesce(p.proconfig, '{}') && array['search_path=""', 'search_path=']
  $$,
  'every security definer function pins search_path to empty'
);
select is_empty(
  $$select tablename from pg_policies where schemaname = 'public' and cmd = 'UPDATE' and (qual is null or with_check is null)$$,
  'every update policy has both using and with check'
);
select is_empty(
  $$select tablename from pg_policies where schemaname = 'public' and cmd in ('DELETE', 'ALL') and tablename <> 'push_subscriptions'$$,
  'no delete or catch-all policy outside push_subscriptions'
);
select is_empty(
  $$select tablename from pg_policies where schemaname = 'public' and (roles <> '{authenticated}' or permissive <> 'PERMISSIVE')$$,
  'every public policy is permissive and scoped to authenticated'
);
select is_empty(
  $$select tablename, cmd from pg_policies where schemaname = 'public' group by 1, 2 having count(*) > 1$$,
  'one policy per table and command, so nothing widens by OR'
);
select is_empty(
  $$select tablename from pg_policies where schemaname = 'public' and (qual = 'true' or with_check = 'true')$$,
  'no policy is using (true)'
);
select is(
  (select count(*)::int from pg_proc where proname = 'accept_invite'),
  1, 'accept_invite has a single signature'
);
select is(
  (select pronargs::int from pg_proc where proname = 'accept_invite'),
  1, 'accept_invite takes only the invitation id, so a client cannot supply a role or email'
);

-- Role escalation through invites.
select test.login('noa@fixture.test');
set local role authenticated;
select throws_ok(
  $$select public.create_invitation('b0000000-0000-4000-8000-000000000001', 'noa+admin@fixture.test', 'admin', 'Noa Admin')$$,
  '42501', NULL, 'a child cannot invite an admin'
);
select throws_ok(
  $$select public.accept_invite('b6000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'a member cannot accept an admin invitation meant for another email'
);

-- Case-insensitive match, invitation role, and create_space.
select test.login('mom@fixture.test');
select set_config(
  'test.cousin_invite',
  public.create_invitation('b0000000-0000-4000-8000-000000000001', '  Cousin@Fixture.TEST ', 'member', 'Cousin', true)::text,
  true
);
select is(
  (select count(*)::int from public.audit_log where action = 'invitation.created' and target = current_setting('test.cousin_invite')),
  1, 'create_invitation writes an audit row'
);
select test.login('cousin@fixture.test');
select lives_ok(
  format('select public.accept_invite(%L)', current_setting('test.cousin_invite')),
  'accept_invite matches the email case-insensitively'
);
select results_eq(
  $$
    select fm.role::text, s.title
    from public.family_members fm
    join public.spaces s on s.owner_member_id = fm.id
    where fm.user_id = 'b1000000-0000-4000-8000-00000000000a'
  $$,
  $$values ('member', 'Cousin')$$,
  'the new member gets the invitation role and a space when create_space is set'
);
select results_eq(
  $$select count(*)::int from public.spaces$$,
  $$values (2)$$,
  'the new child immediately sees only General and their own space'
);

-- A removed member cannot reuse an old invitation, but can rejoin with a new one.
reset role;
insert into public.invitations (id, family_id, email, role, label, invited_by, status, expires_at, accepted_user_id)
values (
  'b6000000-0000-4000-8000-000000000010',
  'b0000000-0000-4000-8000-000000000001',
  'uncle@fixture.test', 'admin', 'Uncle', 'b1000000-0000-4000-8000-000000000001',
  'accepted', now() + interval '3 days', 'b1000000-0000-4000-8000-000000000007'
);
insert into public.invitations (id, family_id, email, role, label, invited_by, expires_at)
values (
  'b6000000-0000-4000-8000-000000000011',
  'b0000000-0000-4000-8000-000000000001',
  'uncle@fixture.test', 'grandparent', 'Uncle', 'b1000000-0000-4000-8000-000000000001',
  now() + interval '3 days'
);
select test.login('uncle@fixture.test');
set local role authenticated;
select throws_ok(
  $$select public.accept_invite('b6000000-0000-4000-8000-000000000010')$$,
  '42501', NULL, 'a removed member cannot reuse an accepted invitation'
);
select lives_ok(
  $$select public.accept_invite('b6000000-0000-4000-8000-000000000011')$$,
  'a removed member can rejoin with a new pending invitation'
);
select results_eq(
  $$select role::text, status::text, removed_at is null from public.family_members where id = 'b2000000-0000-4000-8000-000000000007'$$,
  $$values ('grandparent', 'active', true)$$,
  'rejoining uses the new invitation role, not the old one'
);

-- Last-admin guard (Other Family has one admin).
select test.login('other@fixture.test');
select throws_ok(
  $$select public.remove_member('b2000000-0000-4000-8000-000000000008')$$,
  '42501', NULL, 'the last admin cannot remove themselves'
);
select throws_ok(
  $$select public.change_member_role('b2000000-0000-4000-8000-000000000008', 'member')$$,
  '42501', NULL, 'the last admin cannot demote themselves'
);

-- Every admin RPC writes exactly one audit row.
select test.login('mom@fixture.test');
select public.revoke_invitation('b6000000-0000-4000-8000-000000000001');
select public.change_member_role('b2000000-0000-4000-8000-000000000004', 'member');
select public.archive_space('b3000000-0000-4000-8000-000000000005');
select public.rename_space('b3000000-0000-4000-8000-000000000005', 'Ari (archived)');
select public.remove_member('b2000000-0000-4000-8000-000000000006');
select set_config(
  'test.grandpa_space',
  public.create_member_space('b0000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000004', 'Grandpa')::text,
  true
);
select results_eq(
  $$
    select action, count(*)::int
    from public.audit_log
    where action in ('invitation.revoked', 'member.role_changed', 'space.archived', 'space.renamed', 'member.removed', 'space.created')
      and actor_user_id = 'b1000000-0000-4000-8000-000000000001'
    group by action
    order by action
  $$,
  $$values
    ('invitation.revoked', 1),
    ('member.removed', 1),
    ('member.role_changed', 1),
    ('space.archived', 1),
    ('space.created', 1),
    ('space.renamed', 1)$$,
  'each admin RPC writes one audit row attributed to the caller'
);
select is(
  (select count(*)::int from public.audit_log where action = 'invitation.accepted'),
  2, 'accept_invite writes an audit row'
);

-- Removal takes effect in the same transaction, without a new token.
select test.login('ari@fixture.test');
select is(
  (select count(*)::int from public.spaces),
  0, 'a member removed moments ago sees no spaces'
);
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000001',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000006',
      'Still here?',
      'b1000000-0000-4000-8000-000000000006'
    )
  $$,
  '23503', NULL, 'a member removed moments ago cannot post'
);

-- Archived spaces are read-only, including for the admin who archived them.
select test.login('mom@fixture.test');
select throws_ok(
  $$
    insert into public.messages (space_id, family_id, author_member_id, body, created_by)
    values (
      'b3000000-0000-4000-8000-000000000005',
      'b0000000-0000-4000-8000-000000000001',
      'b2000000-0000-4000-8000-000000000001',
      'Posting into an archived space',
      'b1000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', NULL, 'an admin cannot post in an archived space'
);

-- Known gaps (TODO until fixed).
reset role;
update public.family_members set status = 'removed', removed_at = now() where id = 'b2000000-0000-4000-8000-000000000005';
insert into public.invitations (id, family_id, email, role, label, create_space, invited_by, expires_at)
values (
  'b6000000-0000-4000-8000-000000000012',
  'b0000000-0000-4000-8000-000000000001',
  'noa@fixture.test', 'member', 'Noa', true, 'b1000000-0000-4000-8000-000000000001',
  now() + interval '3 days'
);
select test.login('noa@fixture.test');
set local role authenticated;
select lives_ok(
  $$select public.accept_invite('b6000000-0000-4000-8000-000000000012')$$,
  'a returning child with an existing space can accept a create_space invitation'
);

select test.login('mom@fixture.test');
select throws_ok(
  $$select public.change_member_role('b2000000-0000-4000-8000-000000000002', 'grandparent')$$,
  '22023', NULL, 'change_member_role refuses to make a space owner a grandparent'
);

select * from finish();
rollback;
