-- New media providers. A new enum value cannot be used until this
-- migration commits, so nothing else lives in this file.
alter type public.media_provider add value if not exists 'supabase';
alter type public.media_provider add value if not exists 'b2';
