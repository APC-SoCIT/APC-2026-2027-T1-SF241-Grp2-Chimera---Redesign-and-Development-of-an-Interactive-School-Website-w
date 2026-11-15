-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261114

begin;

-- A revoked Auth session must lose portal access even before its JWT expires.
create function public.has_live_staff_session()
returns boolean language sql stable security definer set search_path = ''
as $$
    select exists (
        select 1 from auth.sessions
        where id = nullif(auth.jwt() ->> 'session_id', '')::uuid and user_id = auth.uid()
    );
$$;

create or replace function public.get_staff_portal_role()
returns text language sql stable security definer set search_path = ''
as $$
    select case when must_change_password then 'password-change' else role end
    from public.users
    where auth_user_id = auth.uid() and account_status = 'active'
      and public.has_live_staff_session();
$$;

create or replace function public.has_active_admin_access()
returns boolean language sql stable security definer set search_path = ''
as $$
    select coalesce(public.get_staff_portal_role() = 'admin', false);
$$;

create or replace function public.can_manage_staff_accounts(p_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
    select (auth.uid() is null or (auth.uid() = p_user_id and public.has_live_staff_session())) and exists (
        select 1 from public.users
        where auth_user_id = p_user_id and role = 'admin' and account_status = 'active'
          and manage_staff_accounts and not must_change_password
    );
$$;

create function public.audit_staff_creation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
    insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
    select (select id from public.users where auth_user_id =
               (u.raw_app_meta_data -> 'chimera_staff_provisioning' ->> 'created_by')::uuid),
           'account.create', 'users', new.id, jsonb_build_object('role', new.role)
    from auth.users u
    where u.id = new.auth_user_id and u.raw_app_meta_data ? 'chimera_staff_provisioning';
    return new;
end;
$$;

create trigger chimera_audit_staff_creation
after insert on public.users for each row execute function public.audit_staff_creation();

-- Lock actor and target in a consistent order through the account change.
create function public.lock_staff_change(p_actor_id uuid, p_staff_id bigint)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint;
begin
    perform 1 from public.users where auth_user_id = p_actor_id or id = p_staff_id
    order by id for update;
    if not public.can_manage_staff_accounts(p_actor_id) then
        raise insufficient_privilege using message = 'Staff account management access required';
    end if;
    select id into actor_id from public.users where auth_user_id = p_actor_id;
    if actor_id = p_staff_id then
        raise insufficient_privilege using message = 'Cannot manage your own account';
    end if;
    return actor_id;
end;
$$;

create or replace function public.assign_staff_role(p_staff_id bigint, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
    actor_id bigint := public.lock_staff_change(auth.uid(), p_staff_id);
    previous_role text;
begin
    if p_role is null or p_role not in ('admin', 'registrar', 'teacher') then
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

-- Account Reset and Deactivation START
create function public.get_staff_auth_target(p_actor_id uuid, p_staff_id bigint)
returns uuid language sql stable security definer set search_path = ''
as $$
    select auth_user_id from public.users
    where id = p_staff_id and account_status = 'active'
      and auth_user_id <> p_actor_id and public.can_manage_staff_accounts(p_actor_id);
$$;

create function public.sync_staff_auth_action()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
    staff_action jsonb := new.raw_app_meta_data -> 'chimera_staff_action';
    previous_action jsonb := old.raw_app_meta_data -> 'chimera_staff_action';
    staff_id bigint;
    actor_id bigint;
begin
    if staff_action is null or staff_action is not distinct from previous_action then
        return new;
    end if;

    -- Auth updates the password, sessions, and metadata in one transaction.
    if staff_action ->> 'action' = 'complete-password-change' then
        if (previous_action ->> 'action') is distinct from 'reset-password'
            or (previous_action ->> 'request_id') is distinct from (staff_action ->> 'reset_id') then
            raise insufficient_privilege using message = 'The password reset has changed';
        end if;
        update public.users set must_change_password = false
        where auth_user_id = new.id and account_status = 'active' and must_change_password;
        if not found then
            raise insufficient_privilege using message = 'Password change is unavailable';
        end if;
        return new;
    end if;

    staff_id := (staff_action ->> 'staff_id')::bigint;
    actor_id := public.lock_staff_change((staff_action ->> 'actor_id')::uuid, staff_id);
    perform 1 from public.users where id = staff_id and auth_user_id = new.id and account_status = 'active';
    if not found then
        raise insufficient_privilege using message = 'Staff account target is unavailable';
    end if;
    case staff_action ->> 'action'
      when 'reset-password' then
        update public.users set must_change_password = true where id = staff_id;
        insert into public.audit_logs (actor_user_id, action, entity_type, entity_id)
        values (actor_id, 'account.password_reset', 'users', staff_id);
      when 'deactivate' then
        update public.users set account_status = 'inactive' where id = staff_id;
        insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value)
        values (actor_id, 'account.deactivate', 'users', staff_id,
            '{"account_status":"active"}'::jsonb, '{"account_status":"inactive"}'::jsonb);
      else
        raise invalid_parameter_value using message = 'Unsupported staff account action';
    end case;
    update public.sessions set revoked_at = now() where user_id = staff_id and revoked_at is null;
    return new;
end;
$$;

create trigger chimera_sync_staff_auth_action
after update of raw_app_meta_data on auth.users
for each row execute function public.sync_staff_auth_action();
-- Account Reset and Deactivation END

revoke all on function public.has_live_staff_session(), public.lock_staff_change(uuid, bigint), public.audit_staff_creation(),
    public.get_staff_auth_target(uuid, bigint), public.sync_staff_auth_action()
    from public, anon, authenticated, service_role;
grant execute on function public.get_staff_auth_target(uuid, bigint) to service_role;

commit;
