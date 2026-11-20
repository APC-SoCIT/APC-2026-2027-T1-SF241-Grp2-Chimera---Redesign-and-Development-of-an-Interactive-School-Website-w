-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261119

begin;

-- Academic Coordinator Role START
-- Extend the existing account roles for the staff member responsible for scheduling.
alter table public.users
    drop constraint users_role_check,
    add constraint users_role_check
        check (role in ('admin', 'registrar', 'teacher', 'academic_coordinator'));

create or replace function public.assign_staff_role(p_staff_id bigint, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint := public.lock_staff_change(auth.uid(), p_staff_id);
    previous_role text;
begin
    if p_role is null or p_role not in ('admin', 'registrar', 'teacher', 'academic_coordinator') then
        raise invalid_parameter_value using message = 'Unsupported staff role';
    end if;
    select role into previous_role from public.users where id = p_staff_id;
    if not found then
        raise no_data_found using message = 'Staff account no longer exists';
    end if;
    if previous_role = p_role then
        return;
    end if;
    update public.users set role = p_role,
        manage_staff_accounts = (p_role = 'admin' and manage_staff_accounts)
    where id = p_staff_id;
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value)
    values (actor_id, 'role.change', 'users', p_staff_id,
        jsonb_build_object('role', previous_role), jsonb_build_object('role', p_role));
end;
$$;
-- Academic Coordinator Role END

commit;
