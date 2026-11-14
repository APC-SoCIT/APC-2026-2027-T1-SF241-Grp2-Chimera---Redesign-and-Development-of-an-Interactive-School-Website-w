-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261114

begin;

-- Staff Portal Role Check START
-- Read the current assignment for the caller without exposing staff records.
create function public.get_staff_portal_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select role from public.users
    where auth_user_id = (select auth.uid())
      and role in ('admin', 'registrar')
      and account_status = 'active'
      and not must_change_password;
$$;

revoke all on function public.get_staff_portal_role() from public, anon, authenticated;
grant execute on function public.get_staff_portal_role() to authenticated;
-- Staff Portal Role Check END

commit;
