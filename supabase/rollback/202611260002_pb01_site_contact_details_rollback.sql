-- Author: Gian Mandac
-- Created Date: 20261126
-- Undoes 202611260002_pb01_site_contact_details.sql. The website goes back to the contact
-- details built into its code. Edited contact details are lost; copy them first if needed.
-- The original news posts and events stay in cms_content (Admins may have edited them); to remove
-- them, move them to Trash in the content workspace. created_by stays optional while any of them
-- has no author.

begin;

drop function if exists public.cms_save_site_content(text, jsonb, timestamptz);
drop function if exists public.cms_get_site_content(text);
drop function if exists public.cms_public_site_content();
drop function if exists public.cms_check_contact_details(jsonb);
drop function if exists public.cms_is_email(jsonb);
drop function if exists public.cms_is_phone(jsonb);
drop function if exists public.cms_is_text(jsonb, integer);
drop table if exists public.site_content;

do $$ begin
    if not exists (select 1 from public.cms_content where created_by is null) then
        alter table public.cms_content alter column created_by set not null;
    end if;
end $$;

commit;
