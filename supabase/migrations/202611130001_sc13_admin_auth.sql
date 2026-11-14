-- Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
-- Created Date: 20261113

begin;

-- Link staff accounts to Supabase Auth while preserving existing staff IDs.
alter table public.users
    add column auth_user_id uuid unique references auth.users(id) on delete set null,
    alter column password_hash drop not null;

alter table public.users enable row level security;
-- Browser roles use the access check below. Account writes stay server-side.
revoke all on table public.users from public, anon, authenticated;

-- Admin Access Check START
create function public.has_active_admin_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.users
        where auth_user_id = (select auth.uid())
          and role = 'admin'
          and account_status = 'active'
          and not must_change_password
    );
$$;

revoke all on function public.has_active_admin_access() from public, anon, authenticated;
grant execute on function public.has_active_admin_access() to authenticated;
-- Admin Access Check END

commit;
