-- Test-only reset of an unjoined bootstrap family. Does not touch another family.
begin;
select set_config('search_path', 'public, extensions', true);

\ir _fixtures.sql.inc

select plan(49);

select test.seed_user(
  'c1000000-0000-4000-8000-000000000001',
  'resetme@fixture.test',
  'Mom'
);
select test.seed_user(
  'c1000000-0000-4000-8000-000000000002',
  'keepme@fixture.test',
  'Keep'
);
select test.seed_user(
  'c1000000-0000-4000-8000-000000000003',
  'joined@fixture.test',
  'Joined'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.reset_unjoined_bootstrap_family(text,text,text)',
    'execute'
  ),
  'service_role can execute reset_unjoined_bootstrap_family'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.reset_unjoined_bootstrap_family(text,text,text)',
    'execute'
  ),
  'authenticated cannot execute reset_unjoined_bootstrap_family'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.reset_unjoined_bootstrap_family(text,text,text)',
    'execute'
  ),
  'anon cannot execute reset_unjoined_bootstrap_family'
);
select ok(
  not has_function_privilege(
    'service_role',
    'private.reset_unjoined_bootstrap_family(text,text,text)',
    'execute'
  ),
  'service_role cannot execute the private reset'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.reset_unjoined_bootstrap_family(text,text,text)',
    'execute'
  ),
  'authenticated cannot execute the private reset'
);
select ok(
  coalesce(
    (
      select p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'reset_unjoined_bootstrap_family'
    ),
    '{}'
  ) && array['search_path=""', 'search_path='],
  'public.reset_unjoined_bootstrap_family pins search_path'
);
select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reset_unjoined_bootstrap_family'
  ),
  'public.reset_unjoined_bootstrap_family is security definer'
);
select ok(
  (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'reset_unjoined_bootstrap_family'
  ),
  'private.reset_unjoined_bootstrap_family is security definer'
);
select ok(
  coalesce(
    (
      select p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private'
        and p.proname = 'reset_unjoined_bootstrap_family'
    ),
    '{}'
  ) && array['search_path=""', 'search_path='],
  'private.reset_unjoined_bootstrap_family pins search_path'
);
select ok(
  pg_get_functiondef('private.reset_unjoined_bootstrap_family(text,text,text)'::regprocedure)
    ~ 'from auth\.users u[[:space:]]+where u\.id = creator[[:space:]]+and private\.normalized_email\(u\.email\) = normalized[[:space:]]+for update',
  'reset locks the auth user before it reads sign-in state'
);
select ok(
  pg_get_functiondef('private.reset_unjoined_bootstrap_family(text,text,text)'::regprocedure)
    ~ 'perform 1[[:space:]]+from public\.invitations i[[:space:]]+where i\.family_id = fam[[:space:]]+for update',
  'reset locks the invite rows before it reads them'
);

set local role authenticated;
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  )$$,
  '42501',
  NULL,
  'authenticated cannot call reset'
);
reset role;

select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'nope'
  )$$,
  '22023',
  'confirmation is required',
  'a reset without the confirmation text is rejected'
);
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    '   ',
    'resetme@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'family name is required',
  'a blank family name is rejected'
);
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'not-an-email',
    'confirm-reset'
  )$$,
  '22023',
  'invalid email',
  'a bad email is rejected'
);
select is(
  public.reset_unjoined_bootstrap_family(
    'Missing Family',
    'resetme@fixture.test',
    'confirm-reset'
  ),
  false,
  'a missing family removes nothing'
);

select public.bootstrap_family(
  'c1000000-0000-4000-8000-000000000002',
  'Keep Family',
  'keepme@fixture.test',
  'Keep'
);
select public.bootstrap_family(
  'c1000000-0000-4000-8000-000000000001',
  'Reset Family',
  'resetme@fixture.test',
  'Mom'
);

select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset-later'
  )$$,
  '22023',
  'confirmation is required',
  'the wrong confirmation does not delete the family'
);
select is(
  (select count(*)::int from public.families where name = 'Reset Family'),
  1,
  'the wrong confirmation leaves the family'
);

select ok(
  public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  ),
  'reset removes the unjoined bootstrap family'
);
select is(
  (select count(*)::int from public.families where name = 'Reset Family'),
  0,
  'the reset family is gone'
);
select is(
  (
    select count(*)::int
    from public.spaces s
    join public.families f on f.id = s.family_id
    where f.name = 'Reset Family'
  ),
  0,
  'the reset family space is gone'
);
select is(
  (select count(*)::int from public.invitations where email = 'resetme@fixture.test'),
  0,
  'the reset invite is gone'
);
select is(
  (
    select count(*)::int
    from public.audit_log a
    join public.families f on f.id = a.family_id
    where f.name = 'Reset Family'
  ),
  0,
  'the reset family audit is gone'
);
select ok(
  not exists (
    select 1 from auth.users where email = 'resetme@fixture.test'
  ),
  'the reset auth user is gone'
);
select ok(
  not exists (
    select 1 from public.profiles where id = 'c1000000-0000-4000-8000-000000000001'
  ),
  'the reset profile is gone'
);
select is(
  (select count(*)::int from public.families where name = 'Keep Family'),
  1,
  'reset does not remove the other family'
);
select ok(
  exists (
    select 1 from auth.users where id = 'c1000000-0000-4000-8000-000000000002'
  ),
  'reset does not remove the other auth user'
);
select is(
  (
    select count(*)::int
    from public.invitations
    where email = 'keepme@fixture.test'
      and status = 'pending'
  ),
  1,
  'reset does not remove the other invite'
);
select is(
  public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  ),
  false,
  'a second reset is a no-op'
);

select test.seed_user(
  'c1000000-0000-4000-8000-000000000001',
  'resetme@fixture.test',
  'Mom'
);
select public.bootstrap_family(
  'c1000000-0000-4000-8000-000000000001',
  'Reset Family',
  'resetme@fixture.test',
  'Mom'
);
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'keepme@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'this family is not an unjoined bootstrap',
  'a different email cannot reset the family'
);
select is(
  (select count(*)::int from public.families where name = 'Reset Family'),
  1,
  'the email mismatch leaves the family'
);

update auth.users
set last_sign_in_at = pg_catalog.now()
where email = 'resetme@fixture.test';
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'this family has been signed into',
  'a signed-in bootstrap user is not deleted'
);
select ok(
  exists (
    select 1 from auth.users where email = 'resetme@fixture.test'
  ),
  'the signed-in user is still there'
);
select is(
  (select count(*)::int from public.families where name = 'Reset Family'),
  1,
  'the signed-in family is still there'
);

update auth.users
set last_sign_in_at = null
where email = 'resetme@fixture.test';
insert into auth.sessions (id, user_id)
values (
  'c1000000-0000-4000-8000-000000000099',
  'c1000000-0000-4000-8000-000000000001'
);
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'this family has been signed into',
  'a session blocks reset even when last_sign_in_at is null'
);
select ok(
  exists (
    select 1 from auth.users where email = 'resetme@fixture.test'
  ),
  'the session user is still there'
);
select is(
  (select count(*)::int from public.families where name = 'Reset Family'),
  1,
  'the session family is still there'
);
delete from auth.sessions
where id = 'c1000000-0000-4000-8000-000000000099';
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (
  'c1000000-0000-4000-8000-000000000001',
  'https://push.example.test/reset-guard',
  'key',
  'auth'
);
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'the auth user is used outside this family',
  'a push subscription blocks the reset'
);
select is(
  (
    select count(*)::int
    from public.push_subscriptions
    where endpoint = 'https://push.example.test/reset-guard'
  ),
  1,
  'the blocking push subscription is not deleted'
);
select is(
  (select count(*)::int from public.families where name = 'Reset Family'),
  1,
  'the blocked reset leaves the family'
);
delete from public.push_subscriptions
where endpoint = 'https://push.example.test/reset-guard';
select ok(
  public.reset_unjoined_bootstrap_family(
    'Reset Family',
    'resetme@fixture.test',
    'confirm-reset'
  ),
  'reset succeeds after the outside row is gone'
);

select set_config(
  'test.join_token',
  (
    select b.token
    from public.bootstrap_family(
      'c1000000-0000-4000-8000-000000000003',
      'Joined Family',
      'joined@fixture.test',
      'Mom'
    ) as b
  ),
  true
);
select test.login('joined@fixture.test');
set local role authenticated;
select lives_ok(
  format(
    'select * from public.accept_invitation(%L)',
    current_setting('test.join_token')
  ),
  'the joined parent can accept'
);
reset role;
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Joined Family',
    'joined@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'this family has members',
  'a family with a member is not reset'
);
select is(
  (select count(*)::int from public.families where name = 'Joined Family'),
  1,
  'the joined family is still there'
);
select ok(
  exists (
    select 1 from auth.users where email = 'joined@fixture.test'
  ),
  'the joined auth user is still there'
);
select is(
  (
    select count(*)::int
    from public.family_members
    where user_id = 'c1000000-0000-4000-8000-000000000003'
      and status = 'active'
  ),
  1,
  'the joined membership is still there'
);

insert into public.families (name, created_by)
values
  ('Dup Family', 'c1000000-0000-4000-8000-000000000002'),
  ('Dup Family', 'c1000000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.reset_unjoined_bootstrap_family(
    'Dup Family',
    'keepme@fixture.test',
    'confirm-reset'
  )$$,
  '22023',
  'family name is not unique',
  'two families with the same name are not reset'
);
select is(
  (select count(*)::int from public.families where name = 'Dup Family'),
  2,
  'both duplicate families remain'
);
select is(
  (select count(*)::int from public.families where name = 'Keep Family'),
  1,
  'the other family remains after the duplicate refusal'
);

select * from finish();
rollback;
