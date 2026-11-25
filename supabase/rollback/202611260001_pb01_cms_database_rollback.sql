-- Author: Gian Mandac
-- Created Date: 20261126
-- UNDO for migrations/202611260001_pb01_cms_database.sql.
-- Removes the content functions and the Admin file rules. Saved website content, the added
-- columns (summary, images, created_at, deleted_at) and uploaded files are kept, so nothing
-- published is lost; set VITE_CMS_DATABASE back to false before running this.

begin;
drop policy if exists "Admins read website files" on storage.objects;
drop policy if exists "Admins upload website files" on storage.objects;
drop policy if exists "Admins replace website files" on storage.objects;
drop policy if exists "Admins remove website files" on storage.objects;
drop function if exists public.cms_delete(text, bigint);
drop function if exists public.cms_trash(text, bigint, boolean);
drop function if exists public.cms_set_status(text, bigint, text);
drop function if exists public.cms_save_resource(bigint, text, text, text, integer, text);
drop function if exists public.cms_list_resources();
drop function if exists public.cms_public_content();
drop function if exists public.cms_save_content(bigint, text, text, text, text, text, timestamptz, jsonb);
drop function if exists public.cms_list_content();
drop function if exists public.require_content_admin();
drop policy if exists "Read public published resources" on public.resources;
create policy "Read public published resources" on public.resources for select to anon, authenticated
    using (status = 'published' and visibility = 'public');
commit;
