-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261114

begin;

-- Registrar Enrollment Access START
-- Limit browser access to the application summary and recheck the current role on every request.
alter table public.enrollment_applications enable row level security;
revoke select on public.enrollment_applications from public, anon, authenticated;

create function public.list_registrar_applications(p_offset integer default 0)
returns table (reference_no text, status text, submitted_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if public.get_staff_portal_role() is distinct from 'registrar' then
        raise insufficient_privilege using message = 'Registrar access required';
    end if;

    return query select a.reference_no, a.status, a.submitted_at
    from public.enrollment_applications a
    order by a.submitted_at desc, a.id desc limit 26 offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.list_registrar_applications(integer)
    from public, anon, authenticated;
grant execute on function public.list_registrar_applications(integer) to authenticated;
-- Registrar Enrollment Access END

commit;
