-- Public pages and keyword search read the same cms_public_content() result.
-- Extend the existing CMS; do not install the superseded parallel CMS backend.
begin;

alter table public.cms_content add column if not exists visibility text not null default 'public';
-- Existing content without a visibility column retains the original public behavior.
-- If a previous integration supplied an unknown visibility, fail closed.
update public.cms_content set visibility = 'private' where visibility is null;
alter table public.cms_content alter column visibility set default 'public';
alter table public.cms_content alter column visibility set not null;
do $$ begin
    if not exists (select 1 from pg_constraint where conrelid = 'public.cms_content'::regclass and conname = 'cms_content_visibility_check') then
        alter table public.cms_content add constraint cms_content_visibility_check check (visibility in ('public', 'private'));
    end if;
end $$;

-- Preserve visibility when the existing Admin workspace loads a private record.
-- The save function leaves this column unchanged; no second editor or save API is added.
drop function public.cms_list_content();
create function public.cms_list_content()
returns table ("contentId" bigint, "contentType" text, "title" text, "slug" text, "summary" text, "body" text,
               "images" jsonb, "eventStartsAt" timestamptz, "status" text, "publishedAt" timestamptz,
               "updatedAt" timestamptz, "deletedAt" timestamptz, "createdByName" text, "updatedByName" text,
               "visibility" text)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.require_content_admin();
    return query
    select c.id, c.content_type, c.title, c.slug, c.summary, c.body, c.images, c.event_date, c.status,
           c.published_at, c.updated_at, c.deleted_at, cu.full_name, uu.full_name, c.visibility
    from public.cms_content c
    left join public.users cu on cu.id = c.created_by
    left join public.users uu on uu.id = c.updated_by
    order by c.updated_at desc;
end;
$$;

-- Keep the public RPC's signature compatible with main. Both pages and search use it.
create or replace function public.cms_public_content()
returns table ("contentId" bigint, "contentType" text, "title" text, "slug" text, "summary" text, "body" text,
               "images" jsonb, "eventStartsAt" timestamptz, "publishedAt" timestamptz, "updatedAt" timestamptz)
language sql stable security definer set search_path = ''
as $$
    select c.id, c.content_type, c.title, c.slug, c.summary, c.body, c.images, c.event_date, c.published_at, c.updated_at
    from public.cms_content c
    where c.status = 'published' and c.visibility = 'public' and c.deleted_at is null
    order by c.published_at desc nulls last;
$$;

revoke all on function public.cms_list_content(), public.cms_public_content() from public, anon, authenticated;
grant execute on function public.cms_list_content() to authenticated;
grant execute on function public.cms_public_content() to anon, authenticated;
commit;
