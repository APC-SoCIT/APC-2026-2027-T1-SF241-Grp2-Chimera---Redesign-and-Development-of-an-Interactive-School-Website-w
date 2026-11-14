-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261114

begin;

create function public.can_manage_staff_accounts(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from public.users
        where auth_user_id = p_user_id and role = 'admin' and account_status = 'active'
          and manage_staff_accounts and not must_change_password
    );
$$;

create function public.list_staff_accounts(p_offset integer default 0)
returns table (id text, full_name text, email text, role text, account_status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if not public.can_manage_staff_accounts(auth.uid()) then
        raise insufficient_privilege using message = 'Staff account management access required';
    end if;

    return query select u.id::text, u.full_name, u.email, u.role, u.account_status
    from public.users u order by u.id desc limit 26 offset greatest(p_offset, 0);
end;
$$;

create function public.assign_staff_role(p_staff_id bigint, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint;
begin
    -- Lock the actor's permission row through the write.
    select id into actor_id from public.users
    where auth_user_id = auth.uid() and role = 'admin' and account_status = 'active'
      and manage_staff_accounts and not must_change_password
    for update;
    if actor_id is null or actor_id = p_staff_id then
        raise insufficient_privilege using message = 'Cannot change this account role';
    end if;
    if p_role is null or p_role not in ('admin', 'registrar', 'teacher') then
        raise invalid_parameter_value using message = 'Unsupported staff role';
    end if;

    update public.users set role = p_role,
        manage_staff_accounts = (p_role = 'admin' and manage_staff_accounts)
    where id = p_staff_id;
    if not found then
        raise no_data_found using message = 'Staff account no longer exists';
    end if;
end;
$$;

-- Staff Provisioning START
-- Auth writes admin-only app metadata when it provisions the login. Link the
-- staff row in that same transaction, so a failed insert rolls back both.
create function public.link_provisioned_staff()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    provisioning jsonb := new.raw_app_meta_data -> 'chimera_staff_provisioning';
begin
    if provisioning is null then
        return new;
    end if;
    if tg_op = 'UPDATE' and provisioning is not distinct from
        (old.raw_app_meta_data -> 'chimera_staff_provisioning') then
        return new;
    end if;

    perform 1 from public.users
    where auth_user_id = (provisioning ->> 'created_by')::uuid
      and role = 'admin' and account_status = 'active'
      and manage_staff_accounts and not must_change_password
    for update;
    if not found then
        raise insufficient_privilege using message = 'Staff account management access required';
    end if;

    insert into public.users (email, full_name, role, auth_user_id)
    values (lower(new.email), provisioning ->> 'full_name', provisioning ->> 'role', new.id);
    return new;
end;
$$;

create trigger chimera_link_provisioned_staff
after insert or update of raw_app_meta_data on auth.users
for each row execute function public.link_provisioned_staff();
-- Staff Provisioning END

revoke all on function public.can_manage_staff_accounts(uuid), public.list_staff_accounts(integer),
    public.assign_staff_role(bigint, text), public.link_provisioned_staff()
    from public, anon, authenticated, service_role;
grant execute on function public.can_manage_staff_accounts(uuid) to service_role;
grant execute on function public.list_staff_accounts(integer), public.assign_staff_role(bigint, text)
    to authenticated;

commit;
