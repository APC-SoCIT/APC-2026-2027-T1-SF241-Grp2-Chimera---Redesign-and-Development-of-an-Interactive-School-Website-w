# SC-56: Protected top-level Admin

The protected account is explicitly designated by a database operator. It is not
inferred from an email address, signup order, staff ID, or the Admin role alone.
Ordinary Admin accounts can still be deactivated by another authorized manager.

## Deployment and designation

1. Apply `supabase/migrations/202611260001_sc56_protected_admin.sql` in the
   Supabase project used by the deployment **before deploying the new API**.
2. In Supabase SQL Editor, identify the intended account (read-only):

   ```sql
   select id, full_name, email, account_status, manage_staff_accounts, is_protected_admin
   from public.users where role = 'admin' order by id;
   ```

3. Designate the correct active, linked Admin with account-management permission.
   Replace the UUID placeholder with that account's Authentication user ID:

   ```sql
   update public.users
   set is_protected_admin = true
   where auth_user_id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid
     and role = 'admin' and account_status = 'active' and manage_staff_accounts
   returning id, full_name, email, is_protected_admin;
   ```

   Exactly the intended account must be returned. No returned row means no
   account was protected. The migration alone does not select an account.
   An already deactivated account must be restored through the project's
   authorized recovery process, including its Auth ban, before designation.

4. Deploy the commit. The staff list labels the account as **Protected top-level
   Admin** and disables **Deactivate** and **Change role**. Password resets remain
   available under the existing authorization checks.

Protection cannot be assigned or removed through the staff API, browser role
assignment RPC, or account-creation input. A trusted database operator can
deliberately transfer it using SQL. Do not remove protection without a successor.

## Enforcement and N05 retest

From a different Admin with `manage_staff_accounts`, verify:

- The protected account is labeled and its destructive controls are disabled.
- A direct `POST /api/staff/accounts` with `action: "deactivate"` and the
  protected staff ID returns **403** before an Auth update is attempted.
- Refreshing confirms the protected account remains active; its login works.
- Ordinary staff deactivation, self-deactivation rejection, audit recording,
  and existing password-reset flows still work.

The `public.users` write guard also rejects deactivation, deletion, demotion,
or removal of management permission while the account remains designated.
If an older API or a racing request reaches the Auth metadata trigger, the
rejected database update rolls back the Auth transaction and its audit insert.
There is no successful `account.deactivate` audit entry for a rejected action.

Attach fresh hosted N05 evidence after deployment. Local tests do not prove the
hosted migration and account designation have been completed.
