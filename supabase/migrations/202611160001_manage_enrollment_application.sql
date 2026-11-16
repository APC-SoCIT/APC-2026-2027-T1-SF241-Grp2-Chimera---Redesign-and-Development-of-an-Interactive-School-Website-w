-- Author: Gian Mandac
-- Created Date: 20261116
-- Manage Enrollment Application (use case diagram ucd.drawio):
--   includes Search and Filter Application
--     -> includes Review Application Details & Documents
--       -> includes View Dynamic Requirement Checklist
--   includes Update Application Status & Registrar Remarks
--     -> Trigger Outbound Status Email (edge function, see supabase/functions). Per the
--        adviser's direction it is never automatic: the Registrar previews the email
--        (status, remarks, requirement checklist) and confirms before it is sent.
--   extended by Print A4 Verification Form (browser print of the reviewed record)
-- Every Registrar action goes through a SECURITY DEFINER function that rechecks the
-- caller's current role and live session. The browser never reads or writes the tables.

begin;

-- Direct Table Access Lockdown START
-- Policies previously added in the dashboard let any signed-in account read every
-- application and let any caller update one. Remove them and the matching grants.
drop policy if exists "Temporary enrollment viewing" on public.enrollment_applications;
drop policy if exists "Allow staff updates on enrollment applications" on public.enrollment_applications;
alter table public.enrollment_applications enable row level security;
alter table public.application_guardians enable row level security;
alter table public.application_documents enable row level security;
alter table public.audit_logs enable row level security;
revoke all on public.enrollment_applications, public.application_guardians,
    public.application_documents, public.audit_logs from public, anon, authenticated;

-- The status email must never be sent automatically. Remove the database webhook
-- that emailed on every update; the Registrar confirms each email in the portal.
drop trigger if exists "notify-application-status-change" on public.enrollment_applications;
-- Direct Table Access Lockdown END

-- Requirement Checklist Storage START
-- Documents are presented onsite in Sprint 1, so the Registrar records each
-- requirement as received. The list of requirements is derived per applicant.
create table if not exists public.application_requirement_checks (
    application_id  bigint not null references public.enrollment_applications(id) on delete cascade,
    requirement_key text not null check (requirement_key ~ '^[a-z0-9-]{1,60}$'),
    received        boolean not null,
    checked_by      bigint references public.users(id) on delete set null,
    checked_at      timestamptz not null default now(),
    primary key (application_id, requirement_key)
);
alter table public.application_requirement_checks enable row level security;
revoke all on public.application_requirement_checks from public, anon, authenticated;
-- Requirement Checklist Storage END

-- Registrar Access Helper START
create function public.require_registrar()
returns bigint language plpgsql stable security definer set search_path = ''
as $$
declare
    actor_id bigint;
begin
    if public.get_staff_portal_role() is distinct from 'registrar' then
        raise insufficient_privilege using message = 'Registrar access required';
    end if;
    select id into actor_id from public.users where auth_user_id = auth.uid();
    return actor_id;
end;
$$;
-- Registrar Access Helper END

-- Search and Filter Application START
create function public.search_registrar_applications(
    p_query text default null,
    p_status text default null,
    p_from date default null,
    p_to date default null,
    p_offset integer default 0
)
returns table (reference_no text, first_name text, surname text, grade_level text, status text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
    q text := lower(btrim(coalesce(p_query, '')));
begin
    perform public.require_registrar();
    if p_status is not null and p_status not in ('pending', 'for_review', 'complete', 'incomplete') then
        raise invalid_parameter_value using message = 'Unknown application status';
    end if;
    if length(q) > 100 then
        raise invalid_parameter_value using message = 'Search text is too long';
    end if;

    -- position() matches literally, so % and _ in the search text are not wildcards.
    return query
    select a.reference_no, a.first_name, a.surname, a.grade_level, a.status, a.submitted_at
    from public.enrollment_applications a
    where (q = '' or position(q in lower(a.reference_no)) > 0
           or position(q in lower(a.first_name || ' ' || coalesce(a.middle_name || ' ', '') || a.surname)) > 0
           or position(q in lower(a.surname || ', ' || a.first_name)) > 0)
      and (p_status is null or a.status = p_status)
      and (p_from is null or (a.submitted_at at time zone 'Asia/Manila')::date >= p_from)
      and (p_to is null or (a.submitted_at at time zone 'Asia/Manila')::date <= p_to)
    order by a.submitted_at desc, a.id desc
    limit 26 offset greatest(p_offset, 0);
end;
$$;
-- Search and Filter Application END

-- Review Application Details & Documents START
-- Returns null for an unknown reference so the portal can show "application not found".
create function public.get_registrar_application(p_reference text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    result jsonb;
begin
    perform public.require_registrar();
    select (to_jsonb(a) - 'submitter_ip_hash' - 'period_id') || jsonb_build_object(
        'school_year', p.school_year,
        'guardians', coalesce((select jsonb_agg(jsonb_build_object(
                'relationship', g.relationship, 'full_name', g.full_name,
                'occupation', g.occupation, 'contact_number', g.contact_number) order by g.relationship)
            from public.application_guardians g where g.application_id = a.id), '[]'::jsonb),
        'documents', coalesce((select jsonb_agg(jsonb_build_object(
                'id', d.id, 'document_type', d.document_type, 'uploaded_at', d.uploaded_at) order by d.uploaded_at)
            from public.application_documents d where d.application_id = a.id), '[]'::jsonb),
        'requirement_checks', coalesce((select jsonb_object_agg(c.requirement_key, c.received)
            from public.application_requirement_checks c where c.application_id = a.id), '{}'::jsonb))
    into result
    from public.enrollment_applications a
    join public.enrollment_periods p on p.id = a.period_id
    where a.reference_no = p_reference;
    return result;
end;
$$;
-- Review Application Details & Documents END

-- View Dynamic Requirement Checklist START
create function public.set_application_requirement(p_reference text, p_requirement text, p_received boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint := public.require_registrar();
    app_id bigint;
    previous boolean;
begin
    if p_requirement is null or p_requirement !~ '^[a-z0-9-]{1,60}$' or p_received is null then
        raise invalid_parameter_value using message = 'Invalid requirement';
    end if;
    select id into app_id from public.enrollment_applications where reference_no = p_reference for update;
    if app_id is null then
        raise no_data_found using message = 'Application not found';
    end if;
    select received into previous from public.application_requirement_checks
    where application_id = app_id and requirement_key = p_requirement;

    insert into public.application_requirement_checks (application_id, requirement_key, received, checked_by, checked_at)
    values (app_id, p_requirement, p_received, actor_id, now())
    on conflict (application_id, requirement_key)
    do update set received = excluded.received, checked_by = excluded.checked_by, checked_at = excluded.checked_at;

    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value)
    values (actor_id, 'application.requirement_check', 'enrollment_applications', app_id,
            case when previous is null then null else jsonb_build_object('requirement', p_requirement, 'received', previous) end,
            jsonb_build_object('requirement', p_requirement, 'received', p_received));
end;
$$;
-- View Dynamic Requirement Checklist END

-- Update Application Status & Registrar Remarks START
-- Pending is the submission state only; processing moves to For Review, Complete or
-- Incomplete. These labels track completeness, not an admission decision (US-11).
create function public.update_application_status(p_reference text, p_status text, p_remarks text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint := public.require_registrar();
    app public.enrollment_applications%rowtype;
    remarks text := nullif(btrim(coalesce(p_remarks, '')), '');
begin
    if p_status is null or p_status not in ('for_review', 'complete', 'incomplete') then
        raise invalid_parameter_value using message = 'Choose For Review, Complete or Incomplete';
    end if;
    if length(remarks) > 1000 then
        raise invalid_parameter_value using message = 'Remarks must be 1,000 characters or fewer';
    end if;
    select * into app from public.enrollment_applications where reference_no = p_reference for update;
    if app.id is null then
        raise no_data_found using message = 'Application not found';
    end if;
    if app.status = p_status and app.registrar_remarks is not distinct from remarks then
        return jsonb_build_object('status', app.status, 'registrar_remarks', app.registrar_remarks, 'changed', false);
    end if;

    update public.enrollment_applications
    set status = p_status, registrar_remarks = remarks
    where id = app.id;

    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value)
    values (actor_id, 'application.status_change', 'enrollment_applications', app.id,
            jsonb_build_object('status', app.status, 'registrar_remarks', app.registrar_remarks),
            jsonb_build_object('status', p_status, 'registrar_remarks', remarks));

    return jsonb_build_object('status', p_status, 'registrar_remarks', remarks, 'changed', true);
end;
$$;
-- Update Application Status & Registrar Remarks END

-- Status Email Audit START
-- Called by the edge function with the Registrar's own session after the email is sent.
create function public.record_status_email(p_reference text, p_status text, p_sent boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint := public.require_registrar();
    app_id bigint;
begin
    select id into app_id from public.enrollment_applications where reference_no = p_reference;
    if app_id is null then
        raise no_data_found using message = 'Application not found';
    end if;
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    values (actor_id, case when p_sent then 'application.status_email' else 'application.status_email_failed' end,
            'enrollment_applications', app_id, jsonb_build_object('status', p_status));
end;
$$;
-- Status Email Audit END

revoke all on function public.require_registrar(),
    public.search_registrar_applications(text, text, date, date, integer),
    public.get_registrar_application(text),
    public.set_application_requirement(text, text, boolean),
    public.update_application_status(text, text, text),
    public.record_status_email(text, text, boolean)
    from public, anon, authenticated;
grant execute on function public.search_registrar_applications(text, text, date, date, integer),
    public.get_registrar_application(text),
    public.set_application_requirement(text, text, boolean),
    public.update_application_status(text, text, text),
    public.record_status_email(text, text, boolean)
    to authenticated;
-- require_registrar is called inside the other SECURITY DEFINER functions as their owner.

commit;
