<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261111
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261113
-->
# SC-13 admin sign-in and dashboard

The staff link in the public footer opens `/login`. Successful email and
password sign-in opens `/admin` when the Supabase user is linked to an active
staff record with role `admin`. Direct dashboard visits use the same database
check. Invalid credentials and denied access leave the user at sign-in.

## Configure a test project

1. Use a Supabase test project with the team's existing `public.users` table.
   Apply `supabase/migrations/202611130001_sc13_admin_auth.sql` through the team's
   migration process. It adds an optional unique Auth UUID and keeps existing
   staff IDs and password hashes. Supabase Auth manages passwords for newly
   linked accounts, so their staff records can leave `password_hash` null.
2. Create or select a confirmed test account in Supabase Authentication. As a
   database administrator, set the corresponding staff row's `auth_user_id`
   to that Auth user's UUID. Confirm the row has `role = 'admin'`,
   `account_status = 'active'`, and `must_change_password = false`.
   Verify the identity before linking. For a new staff record, provide
   `email`, `full_name`, `role`, and `auth_user_id`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in
   `.env.local`. Run `pnpm dev` and open `/login`. The sign-in flow uses
   the browser publishable key.

## Verify access

1. In a signed-out browser, open `/admin` directly. Expect a redirect to `/login`.
2. Sign in as the linked active admin. Expect `/admin`, including after a reload.
3. Try an incorrect password, then a valid account linked to a teacher or inactive
   admin. Expect a sign-in error and no dashboard access.
4. Sign out and navigate back to `/admin`. Expect the login page.

Supabase checks the session token on each call to `has_active_admin_access()`.
The function reads current staff role and status by Auth UUID. It returns a
boolean and can be called only by the authenticated browser role. The migration
revokes direct browser access to the staff table. The Vue Router guard controls
navigation. Keep authorization on the database or server for any protected data
or actions added to the dashboard.

Run `pnpm lint`, `pnpm build`, and `pnpm test`. The login component tests
exercise the route guard with simulated Auth responses. The migration tests run
against local PostgreSQL via PGlite. Run the browser steps above with a configured
test project to verify real Supabase sign-in. SC-15 covers the remaining
session expiry checks.
