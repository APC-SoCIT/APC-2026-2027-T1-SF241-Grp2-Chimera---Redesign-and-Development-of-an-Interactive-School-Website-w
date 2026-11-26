# SC-56: Protected top-level Admin

The protected account is explicitly designated by a database operator. It is not
inferred from an email address, signup order, staff ID, or the Admin role alone.
Ordinary Admin accounts can still be deactivated by another authorized manager.

## Deployment and designation

1. Apply `supabase/migrations/202611260003_sc56_protected_admin.sql` in the
   Supabase project used by the deployment **before deploying the new API**.
   PB-01 uses versions `202611260001` and `202611260002`. SC-56 uses version
   `202611260003`. Apply this version for SC-56.

   If this environment already applied the previous SC-56 SQL, stop and have
   the database operator reconcile the schema and migration history first.
   Renaming the file does not undo applied SQL; rerunning its `ADD COLUMN`
   and `CREATE FUNCTION` statements would fail. The revised SQL also blocks
   protected-Admin password resets, so a filename change alone is insufficient.
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
     and not must_change_password
   returning id, full_name, email, is_protected_admin;
   ```

   Exactly the intended account must be returned. No returned row means no
   account was protected. The migration alone does not select an account.
   An already deactivated account must be restored through the project's
   authorized recovery process, including its Auth ban, before designation.

4. Deploy to a hosted **test/preview** environment first. The staff list labels
   the account as **Protected top-level Admin** and disables **Deactivate**,
   **Change role**, and **Reset password**. Verify the checklist below and attach
   evidence before promoting the updated API to production.

## Password-reset policy

Other staff managers **must not reset the protected Admin's password**. Recovery
requires a trusted database/project operator using the approved Supabase Auth
recovery process outside the staff-management dashboard. The API rejects the
reset with **403**, and the database rejects the reset metadata transaction even
if an older API bypasses the preflight. This adds no new application role.
Ordinary staff password resets retain their existing authorization checks.

Protection cannot be assigned or removed through the staff API, browser role
assignment RPC, or account-creation input. A trusted database operator can
deliberately transfer it using SQL. Do not remove protection without a successor.

## Enforcement and N05 retest

From a different Admin with `manage_staff_accounts`, verify:

- The protected account is labeled and its destructive controls are disabled.
- A direct `POST /api/staff/accounts` with `action: "deactivate"` and the
  protected staff ID returns **403** before an Auth update is attempted.
- Refreshing confirms the protected account remains active; its login works.
- A protected-Admin password-reset request returns **403** without returning a
  temporary password or changing the existing login or session.
- Ordinary staff deactivation, self-deactivation rejection, audit recording,
  and existing password-reset flows still work.

The `public.users` write guard also rejects deactivation, deletion, demotion,
or removal of management permission while the account remains designated.
If an older API or a racing request reaches the Auth metadata trigger, the
rejected database update rolls back the Auth transaction and its audit insert.
There is no successful `account.deactivate` audit entry for a rejected action.

Attach fresh hosted N05 evidence after deployment. Local tests do not prove the
hosted migration and account designation have been completed.

Record the preview URL, commit SHA, migration version, designated staff ID,
test time, acting staff ID, response status, and screenshot/audit evidence.
Check the protected account's active status **and** an ordinary disposable
account's successful deactivation (`account.deactivate` audit entry and denied
subsequent access). Until those hosted checks are recorded, the deployment
verification is pending; do not describe it as passed based on automated tests.
