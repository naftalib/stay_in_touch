-- Bootstrap family: service-only, idempotent, self-accept, orphan pending user.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(23);

select test.seed_user(
  'b1000000-0000-4000-8000-00000000000d',
  'firstparent@fixture.test',
  'Mom'
);
select test.seed_user(
  'b1000000-0000-4000-8000-00000000000e',
  'pendingorphan@fixture.test',
  'Pending'
);
select test.seed_user(
  'b1000000-0000-4000-8000-00000000000f',
  'expiredorphan@fixture.test',
  'Expired'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.bootstrap_family(uuid,text,text,text)',
    'execute'
  ),
  'service_role can execute bootstrap_family'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.bootstrap_family(uuid,text,text,text)',
    'execute'
  ),
  'authenticated cannot execute bootstrap_family'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.bootstrap_family(uuid,text,text,text)',
    'execute'
  ),
  'anon cannot execute bootstrap_family'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.bootstrap_family(uuid,text,text,text)',
    'execute'
  ),
  'authenticated cannot execute private.bootstrap_family'
);
select ok(
  coalesce(
    (
      select p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'bootstrap_family'
    ),
    '{}'
  ) && array['search_path=""', 'search_path='],
  'public.bootstrap_family pins search_path'
);

set local role authenticated;
select throws_ok(
  $$select * from public.bootstrap_family(
    'b1000000-0000-4000-8000-00000000000d',
    'Bootstrap Family',
    'firstparent@fixture.test',
    'Mom'
  )$$,
  '42501',
  NULL,
  'authenticated cannot call bootstrap_family'
);
reset role;

select throws_ok(
  $$select * from public.bootstrap_family(
    'b1000000-0000-4000-8000-00000000000d',
    '   ',
    'firstparent@fixture.test',
    'Mom'
  )$$,
  '22023',
  NULL,
  'a blank family name is rejected'
);
select throws_ok(
  $$select * from public.bootstrap_family(
    'b1000000-0000-4000-8000-00000000000d',
    'Bootstrap Family',
    'not-an-email',
    'Mom'
  )$$,
  '22023',
  NULL,
  'a bad email is rejected'
);

select set_config(
  'test.boot_token',
  (
    select b.token
    from public.bootstrap_family(
      'b1000000-0000-4000-8000-00000000000d',
      'Bootstrap Family',
      'firstparent@fixture.test',
      'Mom'
    ) as b
  ),
  true
);
select set_config(
  'test.boot_family',
  (
    select f.id::text
    from public.families f
    where f.name = 'Bootstrap Family'
  ),
  true
);

select is(
  (select count(*)::int from public.families where name = 'Bootstrap Family'),
  1,
  'bootstrap creates one family'
);
select is(
  (
    select count(*)::int
    from public.spaces
    where family_id = current_setting('test.boot_family')::uuid
      and kind = 'general'
      and title = 'General'
  ),
  1,
  'bootstrap creates one General space'
);
select is(
  (
    select count(*)::int
    from public.invitations
    where family_id = current_setting('test.boot_family')::uuid
      and role = 'admin'
      and create_space
      and invited_by = 'b1000000-0000-4000-8000-00000000000d'
      and status = 'pending'
  ),
  1,
  'bootstrap creates one admin invitation from the invitee'
);

create temp table boot_again on commit drop as
select *
from public.bootstrap_family(
  'b1000000-0000-4000-8000-00000000000d',
  'Bootstrap Family',
  'firstparent@fixture.test',
  'Mom'
);
select is(
  (select reused from boot_again),
  true,
  'a second bootstrap reuses the family'
);
select set_config('test.boot_token', (select token from boot_again), true);
select is(
  (select count(*)::int from public.families where name = 'Bootstrap Family'),
  1,
  'a second bootstrap does not create another family'
);

select test.login('firstparent@fixture.test');
set local role authenticated;
select lives_ok(
  format(
    'select * from public.accept_invitation(%L)',
    current_setting('test.boot_token')
  ),
  'accept_invitation works when invited_by is the invitee'
);
reset role;

select is(
  (
    select role::text
    from public.family_members
    where family_id = current_setting('test.boot_family')::uuid
      and user_id = 'b1000000-0000-4000-8000-00000000000d'
      and status = 'active'
  ),
  'admin',
  'the first parent is an admin'
);
select is(
  (
    select invited_by::text
    from public.family_members
    where family_id = current_setting('test.boot_family')::uuid
      and user_id = 'b1000000-0000-4000-8000-00000000000d'
  ),
  'b1000000-0000-4000-8000-00000000000d',
  'the membership records the invitee as invited_by'
);
select is(
  (
    select count(*)::int
    from public.spaces
    where family_id = current_setting('test.boot_family')::uuid
      and kind = 'member'
      and title = 'Mom'
  ),
  1,
  'accept creates the parent space'
);

select is(
  (
    select b.token is null and b.reused
    from public.bootstrap_family(
      'b1000000-0000-4000-8000-00000000000d',
      'Bootstrap Family',
      'firstparent@fixture.test',
      'Mom'
    ) as b
  ),
  true,
  'bootstrap after accept is a no-op'
);

select public.bootstrap_family(
  'b1000000-0000-4000-8000-00000000000e',
  'Orphan Hold Family',
  'pendingorphan@fixture.test',
  'Pending'
);
select is(
  private.cleanup_orphan_invite_auth_users(),
  0,
  'cleanup deletes nobody while a bootstrap invite is pending'
);
select ok(
  exists (
    select 1 from auth.users where id = 'b1000000-0000-4000-8000-00000000000e'
  ),
  'the pending bootstrap user is still there'
);

insert into public.invitations (
  family_id, email, role, label, invited_by, status, expires_at
)
values (
  'b0000000-0000-4000-8000-000000000001',
  'expiredorphan@fixture.test',
  'member',
  'Expired',
  'b1000000-0000-4000-8000-000000000001',
  'pending',
  pg_catalog.now() - interval '1 day'
);
select cmp_ok(
  private.cleanup_orphan_invite_auth_users(),
  '>=',
  1,
  'cleanup still deletes a user whose only invite has expired'
);
select ok(
  not exists (
    select 1 from auth.users where id = 'b1000000-0000-4000-8000-00000000000f'
  ),
  'the expired orphan user is gone'
);
select ok(
  exists (
    select 1 from auth.users where id = 'b1000000-0000-4000-8000-00000000000e'
  ),
  'the pending bootstrap user is still kept'
);

select * from finish();
rollback;
