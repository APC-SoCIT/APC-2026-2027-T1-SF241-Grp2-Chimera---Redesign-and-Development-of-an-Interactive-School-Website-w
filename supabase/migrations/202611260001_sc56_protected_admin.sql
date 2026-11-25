-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261126
begin;

-- Designation is an operator decision, never inferred from an email or row ID.
-- Browser roles already have no direct write access to public.users.
alter table public.users
    add column is_protected_admin boolean not null default false,
    add constraint users_protected_admin_check check (
        not is_protected_admin or
        (role = 'admin' and account_status = 'active' and manage_staff_accounts)
    );

-- Enforce protection at the write boundary as well as the API preflight.
-- A rejected Auth metadata trigger rolls back its password/ban changes too.
create function public.guard_protected_admin()
returns trigger language plpgsql set search_path = ''
as $$
begin
    if old.is_protected_admin then
        if tg_op = 'DELETE' then
            raise insufficient_privilege using message = 'The protected top-level Admin cannot be deleted';
        end if;
        if new.is_protected_admin and
            (new.role <> 'admin' or new.account_status <> 'active' or not new.manage_staff_accounts) then
            raise insufficient_privilege using message = 'The protected top-level Admin must remain an active account manager';
        end if;
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create trigger chimera_guard_protected_admin
before update or delete on public.users
for each row execute function public.guard_protected_admin();

create function public.get_staff_deactivation_target(p_actor_id uuid, p_staff_id bigint)
returns uuid language sql stable security definer set search_path = ''
as $$
    select auth_user_id from public.users
    where id = p_staff_id and account_status = 'active'
      and not is_protected_admin and auth_user_id <> p_actor_id
      and public.can_manage_staff_accounts(p_actor_id);
$$;

-- Existing callers keep the same RPC and pagination; the flag is additive.
drop function public.list_staff_accounts(integer);
create function public.list_staff_accounts(p_offset integer default 0)
returns table (id text, full_name text, email text, role text, account_status text, is_protected_admin boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if not public.can_manage_staff_accounts(auth.uid()) then
        raise insufficient_privilege using message = 'Staff account management access required';
    end if;
    return query select u.id::text, u.full_name, u.email, u.role, u.account_status, u.is_protected_admin
    from public.users u order by u.id desc limit 26 offset greatest(p_offset, 0);
end;
$$;

revoke all on function public.guard_protected_admin(), public.get_staff_deactivation_target(uuid, bigint),
    public.list_staff_accounts(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_staff_deactivation_target(uuid, bigint) to service_role;
grant execute on function public.list_staff_accounts(integer) to authenticated;

commit;
