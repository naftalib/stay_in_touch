-- Tables, keys, checks, and the indexes policies and foreign keys filter on.
-- Composite foreign keys keep family_id aligned with the parent space or member.
-- Triggers in the next migration reject mismatches with a clear error as well.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_key text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint profiles_display_name_not_blank check (char_length(btrim(display_name)) > 0),
  constraint profiles_avatar_key_has_no_email check (
    avatar_key is null or position('@' in avatar_key) = 0
  )
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles (id),
  deleted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint families_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id),
  user_id uuid not null references public.profiles (id),
  role public.family_role not null,
  label text not null,
  status public.member_status not null default 'active',
  invited_by uuid references public.profiles (id),
  removed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint family_members_label_not_blank check (char_length(btrim(label)) > 0),
  constraint family_members_removed_at_matches_status check (
    (status = 'active' and removed_at is null)
    or (status = 'removed' and removed_at is not null)
  ),
  constraint family_members_family_user_key unique (family_id, user_id),
  constraint family_members_family_id_key unique (family_id, id)
);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id),
  kind public.space_kind not null,
  owner_member_id uuid,
  title text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint spaces_title_not_blank check (char_length(btrim(title)) > 0),
  constraint spaces_kind_owner_check check (
    (kind = 'general' and owner_member_id is null)
    or (kind = 'member' and owner_member_id is not null)
  ),
  constraint spaces_family_id_key unique (family_id, id),
  constraint spaces_owner_same_family foreign key (family_id, owner_member_id)
    references public.family_members (family_id, id)
);

create unique index spaces_one_general_per_family
  on public.spaces (family_id)
  where kind = 'general';

create unique index spaces_one_per_owner
  on public.spaces (owner_member_id)
  where owner_member_id is not null;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  family_id uuid not null references public.families (id),
  author_member_id uuid not null,
  body text not null,
  reply_to_id uuid references public.messages (id),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint messages_body_not_blank check (char_length(btrim(body)) > 0),
  constraint messages_space_same_family foreign key (family_id, space_id)
    references public.spaces (family_id, id),
  constraint messages_author_same_family foreign key (family_id, author_member_id)
    references public.family_members (family_id, id)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  family_id uuid not null references public.families (id),
  uploader_member_id uuid not null,
  message_id uuid references public.messages (id),
  kind public.media_kind not null,
  r2_key text not null,
  thumb_key text,
  content_type text not null,
  size_bytes bigint,
  width integer,
  height integer,
  duration_s numeric,
  status public.media_status not null default 'pending',
  provider public.media_provider not null default 'r2',
  provider_asset_id text,
  caption text,
  deleted_at timestamptz,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint media_space_same_family foreign key (family_id, space_id)
    references public.spaces (family_id, id),
  constraint media_uploader_same_family foreign key (family_id, uploader_member_id)
    references public.family_members (family_id, id),
  constraint media_size_nonnegative check (size_bytes is null or size_bytes >= 0),
  constraint media_width_positive check (width is null or width > 0),
  constraint media_height_positive check (height is null or height > 0),
  constraint media_duration_nonnegative check (duration_s is null or duration_s >= 0),
  constraint media_r2_key_shape check (
    r2_key ~ (
      '^f/' || family_id::text || '/s/' || space_id::text || '/' || id::text || '/original\.[a-z0-9]+$'
    )
  ),
  constraint media_thumb_key_shape check (
    thumb_key is null
    or thumb_key = (
      'f/' || family_id::text || '/s/' || space_id::text || '/' || id::text || '/thumb.jpg'
    )
  ),
  constraint media_keys_have_no_email check (
    position('@' in r2_key) = 0
    and (thumb_key is null or position('@' in thumb_key) = 0)
  )
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id),
  email text not null,
  role public.family_role not null,
  label text not null,
  create_space boolean not null default false,
  invited_by uuid not null references public.profiles (id),
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_user_id uuid references public.profiles (id),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint invitations_email_has_at check (position('@' in email) > 1),
  constraint invitations_label_not_blank check (char_length(btrim(label)) > 0),
  constraint invitations_accepted_user_check check (
    (status = 'accepted' and accepted_user_id is not null)
    or (status <> 'accepted' and accepted_user_id is null)
  )
);

create unique index invitations_one_pending_email
  on public.invitations (family_id, lower(email))
  where status = 'pending';

create table public.space_reads (
  member_id uuid not null references public.family_members (id),
  space_id uuid not null references public.spaces (id),
  last_read_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (member_id, space_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_used_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint push_subscriptions_endpoint_key unique (endpoint)
);

create table public.notification_prefs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.family_members (id),
  space_id uuid references public.spaces (id),
  push boolean not null default true,
  email public.email_preference not null default 'off',
  muted_until timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create unique index notification_prefs_member_space_key
  on public.notification_prefs (member_id, space_id)
  where space_id is not null;

create unique index notification_prefs_member_default_key
  on public.notification_prefs (member_id)
  where space_id is null;

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (id),
  space_id uuid references public.spaces (id),
  type text not null,
  ref_id uuid,
  push_sent_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint notification_outbox_type_not_blank check (char_length(btrim(type)) > 0)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id),
  actor_user_id uuid references public.profiles (id),
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint audit_log_action_not_blank check (char_length(btrim(action)) > 0)
);

-- Policy and foreign-key indexes. Leading columns of unique keys are not repeated.
create index families_created_by_idx on public.families (created_by);

create index family_members_user_id_idx on public.family_members (user_id);

create index family_members_invited_by_idx on public.family_members (invited_by);

create index family_members_active_user_idx
  on public.family_members (user_id)
  where status = 'active';

create index spaces_family_id_idx on public.spaces (family_id);

create index spaces_created_by_idx on public.spaces (created_by);

create index messages_space_created_idx on public.messages (space_id, created_at);

create index messages_family_id_idx on public.messages (family_id);

create index messages_author_member_id_idx on public.messages (author_member_id);

create index messages_reply_to_id_idx on public.messages (reply_to_id);

create index messages_created_by_idx on public.messages (created_by);

create index media_space_created_idx on public.media (space_id, created_at);

create index media_family_id_idx on public.media (family_id);

create index media_uploader_member_id_idx on public.media (uploader_member_id);

create index media_message_id_idx on public.media (message_id);

create index media_created_by_idx on public.media (created_by);

create index invitations_family_id_idx on public.invitations (family_id);

create index invitations_invited_by_idx on public.invitations (invited_by);

create index invitations_accepted_user_id_idx on public.invitations (accepted_user_id);

create index space_reads_space_id_idx on public.space_reads (space_id);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create index notification_prefs_member_id_idx on public.notification_prefs (member_id);

create index notification_prefs_space_id_idx on public.notification_prefs (space_id);

create index notification_outbox_recipient_idx
  on public.notification_outbox (recipient_user_id);

create index notification_outbox_space_id_idx on public.notification_outbox (space_id);

create index audit_log_family_created_idx on public.audit_log (family_id, created_at);

create index audit_log_actor_user_id_idx on public.audit_log (actor_user_id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'families',
    'family_members',
    'spaces',
    'messages',
    'media',
    'invitations',
    'space_reads',
    'push_subscriptions',
    'notification_prefs',
    'notification_outbox',
    'audit_log'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;
