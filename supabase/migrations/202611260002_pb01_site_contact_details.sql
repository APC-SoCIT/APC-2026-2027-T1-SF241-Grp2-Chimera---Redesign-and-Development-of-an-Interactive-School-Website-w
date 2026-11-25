-- Author: Gian Mandac
-- Created Date: 20261126
-- PB-01 Manage Website Content: Admins can edit the school's contact details, and the website's
-- original news posts and events move into cms_content so Admins can edit them too.
-- Adds only: one table (site_content), eight functions, one seeded contact row and the original
-- news and events. The one change to an existing table: cms_content.created_by may be empty, for
-- the original posts that no staff member created (the workspace shows "SNCS website").
-- Requires 202611260001_pb01_cms_database.sql.

begin;

-- Site Content START
-- One row per editable part of the public website. Today only 'contact'.
create table if not exists public.site_content (
    id          bigint generated always as identity primary key,
    key         text not null unique check (key in ('contact')),
    content     jsonb not null check (jsonb_typeof(content) = 'object'),
    updated_by  bigint references public.users(id) on delete set null,
    updated_at  timestamptz not null default now()
);
alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
-- Site Content END

-- Original Posts START
-- The website's original news posts and events have no staff author.
alter table public.cms_content alter column created_by drop not null;
-- Original Posts END

-- Contact Details Rules START
-- Small checks shared by the contact rules below.
create function public.cms_is_text(v jsonb, max_length integer)
returns boolean language sql immutable set search_path = ''
as $$ select jsonb_typeof(v) = 'string' and length(btrim(v #>> '{}')) between 1 and max_length $$;

create function public.cms_is_phone(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9+() .-]{7,25}$'
             and length(regexp_replace(v #>> '{}', '[^0-9]', '', 'g')) between 7 and 15 $$;

create function public.cms_is_email(v jsonb)
returns boolean language sql immutable set search_path = ''
as $$ select jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
             and length(v #>> '{}') <= 254 $$;

-- The same rules the workspace form checks before saving. Raises the first problem found.
-- Each check must be true; a missing field makes it null, which also fails.
create function public.cms_check_contact_details(p jsonb)
returns void language plpgsql immutable set search_path = ''
as $$
declare
    office jsonb;
    channel jsonb;
    office_name text;
    slugs text[] := '{}';
begin
    if not coalesce(jsonb_typeof(p) = 'object', false) then
        raise invalid_parameter_value using message = 'Contact details are missing';
    end if;
    if not coalesce(public.cms_is_text(p->'address', 300), false) then
        raise invalid_parameter_value using message = 'Enter the school address (up to 300 characters)';
    end if;
    if not coalesce(public.cms_is_text(p->'officeHours', 200), false) then
        raise invalid_parameter_value using message = 'Enter the office hours (up to 200 characters)';
    end if;
    if not coalesce(public.cms_is_phone(p->'mainPhone'), false) then
        raise invalid_parameter_value using message = 'Enter the main phone number, for example (02) 8837-9702';
    end if;
    if not coalesce(public.cms_is_email(p->'admissionsEmail'), false) then
        raise invalid_parameter_value using message = 'Enter the admissions email address';
    end if;
    if not coalesce(jsonb_typeof(p->'offices') = 'array' and jsonb_array_length(p->'offices') between 1 and 12, false) then
        raise invalid_parameter_value using message = 'List between 1 and 12 offices';
    end if;

    for office in select value from jsonb_array_elements(p->'offices') loop
        if not coalesce(public.cms_is_text(office->'name', 100), false) then
            raise invalid_parameter_value using message = 'Enter a name for every office (up to 100 characters)';
        end if;
        office_name := btrim(office->>'name');
        if not coalesce(jsonb_typeof(office->'slug') = 'string' and office->>'slug' ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                        and length(office->>'slug') <= 60, false) then
            raise invalid_parameter_value using message = office_name || ': the office link name is not valid';
        end if;
        if (office->>'slug') = any(slugs) then
            raise invalid_parameter_value using message = office_name || ': two offices have the same name';
        end if;
        slugs := slugs || (office->>'slug');
        if not coalesce(jsonb_typeof(office->'description') = 'string' and length(office->>'description') <= 400, false) then
            raise invalid_parameter_value using message = office_name || ': the description can be up to 400 characters';
        end if;
        if not coalesce(jsonb_typeof(office->'channels') = 'array' and jsonb_array_length(office->'channels') between 1 and 8, false) then
            raise invalid_parameter_value using message = office_name || ': add between 1 and 8 ways to reach the office';
        end if;
        for channel in select value from jsonb_array_elements(office->'channels') loop
            if channel->>'kind' = 'phone' then
                if not coalesce(public.cms_is_phone(channel->'value'), false) then
                    raise invalid_parameter_value using message = office_name || ': enter a valid phone number';
                end if;
            elsif channel->>'kind' = 'email' then
                if not coalesce(public.cms_is_email(channel->'value'), false) then
                    raise invalid_parameter_value using message = office_name || ': enter a valid email address';
                end if;
            elsif channel->>'kind' = 'link' then
                if not coalesce(jsonb_typeof(channel->'value') = 'string' and channel->>'value' ~ '^https://[^[:space:]]+$'
                                and length(channel->>'value') <= 500, false) then
                    raise invalid_parameter_value using message = office_name || ': links must start with https://';
                end if;
                if not coalesce(public.cms_is_text(channel->'label', 100), false) then
                    raise invalid_parameter_value using message = office_name || ': enter the text to show for each link';
                end if;
            else
                raise invalid_parameter_value using message = office_name || ': unknown contact type';
            end if;
        end loop;
    end loop;
end;
$$;
-- Contact Details Rules END

-- Manage Site Content START
-- Visitors: the published contact details.
create function public.cms_public_site_content()
returns table ("key" text, "content" jsonb)
language sql stable security definer set search_path = ''
as $$
    select s.key, s.content from public.site_content s order by s.key;
$$;

-- Admins: one part of the site, with who changed it last and when.
create function public.cms_get_site_content(p_key text)
returns table ("content" jsonb, "updatedAt" timestamptz, "updatedByName" text)
language plpgsql stable security definer set search_path = ''
as $$
begin
    perform public.require_content_admin();
    return query
    select s.content, s.updated_at, u.full_name
    from public.site_content s
    left join public.users u on u.id = s.updated_by
    where s.key = p_key;
end;
$$;

-- Admins: save one part of the site. p_expected_updated_at is the version the Admin edited, so a
-- save never silently overwrites another Admin's newer change. Returns the new version.
create function public.cms_save_site_content(p_key text, p_content jsonb, p_expected_updated_at timestamptz)
returns timestamptz language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint := public.require_content_admin();
    current_row public.site_content%rowtype;
    row_id bigint;
    saved_at timestamptz;
begin
    if p_key = 'contact' then
        perform public.cms_check_contact_details(p_content);
    else
        raise invalid_parameter_value using message = 'Unknown part of the website';
    end if;

    select * into current_row from public.site_content where key = p_key for update;
    if current_row.id is not null and current_row.updated_at is distinct from p_expected_updated_at then
        raise exception 'Another Admin changed these details. Reload to see their changes.';
    end if;

    if current_row.id is null then
        insert into public.site_content (key, content, updated_by)
        values (p_key, p_content, actor_id)
        returning id, updated_at into row_id, saved_at;
    else
        update public.site_content
        set content = p_content, updated_by = actor_id, updated_at = clock_timestamp()
        where id = current_row.id
        returning id, updated_at into row_id, saved_at;
    end if;

    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value)
    values (actor_id, 'cms.site_content', 'site_content', row_id,
            jsonb_build_object('key', p_key, 'content', current_row.content),
            jsonb_build_object('key', p_key, 'content', p_content));
    return saved_at;
end;
$$;
-- Manage Site Content END

-- Function Permissions START
revoke all on function public.cms_is_text(jsonb, integer), public.cms_is_phone(jsonb), public.cms_is_email(jsonb),
    public.cms_check_contact_details(jsonb), public.cms_public_site_content(),
    public.cms_get_site_content(text), public.cms_save_site_content(text, jsonb, timestamptz)
    from public, anon, authenticated;
grant execute on function public.cms_public_site_content() to anon, authenticated;
grant execute on function public.cms_get_site_content(text),
    public.cms_save_site_content(text, jsonb, timestamptz) to authenticated;
-- Function Permissions END

-- Current Contact Details START
-- Today's contact details, exactly as the website shows them.
insert into public.site_content (key, content) values ('contact', $json$
{
  "address": "Sampaloc St., Zone 1, North Signal Village, Taguig City",
  "officeHours": "Monday to Friday, 8:00 AM–5:00 PM",
  "mainPhone": "(02) 8837-9702",
  "admissionsEmail": "officeoftheregistrar@sncstaguig.edu.ph",
  "offices": [
    { "slug": "registrar", "name": "Registrar / Admissions",
      "description": "Enrollment guidance, admission requirements, school records, and document requests.",
      "channels": [
        { "kind": "email", "value": "officeoftheregistrar@sncstaguig.edu.ph" },
        { "kind": "link", "value": "https://www.facebook.com/messages/t/1626374049", "label": "Message the Registrar" } ] },
    { "slug": "principal", "name": "Office of the Principal",
      "description": "General school inquiries and academic concerns.",
      "channels": [
        { "kind": "phone", "value": "(02) 8837-9702" },
        { "kind": "phone", "value": "(02) 8295-5861" },
        { "kind": "email", "value": "sncsofficeoftheprincipal@gmail.com" },
        { "kind": "email", "value": "sncs_tagig@yahoo.com" } ] },
    { "slug": "finance", "name": "Finance Office",
      "description": "Current school fees, accounting, and payment inquiries.",
      "channels": [
        { "kind": "phone", "value": "(02) 8866-0281" },
        { "kind": "email", "value": "sncsfinance@gmail.com" } ] },
    { "slug": "library", "name": "School Library",
      "description": "Library services, research, and reading resources.",
      "channels": [
        { "kind": "phone", "value": "(02) 7919-5211" },
        { "kind": "link", "value": "https://library.sncstaguig.edu.ph/", "label": "Visit the library website" } ] }
  ]
}
$json$::jsonb)
on conflict (key) do nothing;
do $$ begin
    perform public.cms_check_contact_details((select content from public.site_content where key = 'contact'));
end $$;
-- Current Contact Details END

-- Original News And Events START
-- Published as they appear today. The website keeps each post's category, photo, end date and
-- source link by matching the page identifier. Skipped if an item already uses the identifier.
insert into public.cms_content (content_type, title, slug, summary, body, event_date, status, created_by, updated_by, published_at)
select v.content_type, v.title, v.slug, v.summary, v.body, v.event_date, 'published', null, null, null
from (values
    ('announcement', 'School office transactions', 'office-transactions',
     'School office transactions are available Monday to Friday, from 8:00 AM to 5:00 PM.',
     E'The school welcomes office transactions from Monday to Friday, 8:00 AM to 5:00 PM.\n\nFor admissions and school records, contact the Registrar. For payment questions, contact the Finance Office.',
     null::timestamptz),
    ('announcement', 'GENYO learning platform for SY 2026–2027', 'genyo-learning-platform-2026-2027',
     'SNCS announces a GENYO 5G Systems learning-platform upgrade for the school community.',
     E'For school year 2026–2027, SNCS has announced an upgrade to the GENYO 5G Systems Learning Platform to support online distance learning.\n\nContact the school for information about learning-platform access and enrollment.',
     null),
    ('event', 'Wellness break: intermediate to high school', 'wellness-break',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-10T00:00:00+08:00'),
    ('event', 'Employees wellness break', 'employees-wellness-break',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-14T00:00:00+08:00'),
    ('event', 'Launching of CL, Science, and Math Week', 'cl-science-math-launch',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-21T00:00:00+08:00'),
    ('event', 'BSP and GSP investiture', 'bsp-gsp-investiture',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-25T00:00:00+08:00'),
    ('event', 'First Term Card Day and Parents’ Faith Formation', 'first-term-card-day',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-26T00:00:00+08:00'),
    ('event', 'Kainang Pamilya Mahalaga Day', 'kainang-pamilya',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-28T00:00:00+08:00'),
    ('event', 'Culminating of CL, Science, and Math Week', 'cl-science-math-culminating',
     'Published in the school’s September 2026 activity notices.', 'Published in the school’s September 2026 activity notices.',
     '2026-09-28T00:00:00+08:00')
) as v(content_type, title, slug, summary, body, event_date)
where not exists (select 1 from public.cms_content c where c.slug = v.slug);
-- Original News And Events END

commit;
