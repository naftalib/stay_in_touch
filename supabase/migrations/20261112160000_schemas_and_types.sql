-- Private schema for access helpers and triggers.
-- It is not listed in config api.schemas, so PostgREST does not expose it.

create schema if not exists private;

revoke all on schema private from public;

comment on schema private is
  'Security-definer helpers and triggers. Not exposed through the Data API.';

-- pgcrypto lives in extensions. gen_random_uuid() is built into Postgres 17.
create extension if not exists pgcrypto with schema extensions;

create type public.family_role as enum ('admin', 'grandparent', 'member');

create type public.member_status as enum ('active', 'removed');

create type public.space_kind as enum ('general', 'member');

create type public.media_kind as enum ('photo', 'video');

create type public.media_status as enum ('pending', 'ready', 'failed');

create type public.media_provider as enum ('r2', 'mux');

create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create type public.email_preference as enum ('off', 'instant', 'daily');

comment on type public.family_role is
  'Per-family role. New values (for example relative) can be added later.';

-- Touch updated_at. Invoker: it only rewrites NEW and does not read other tables.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
