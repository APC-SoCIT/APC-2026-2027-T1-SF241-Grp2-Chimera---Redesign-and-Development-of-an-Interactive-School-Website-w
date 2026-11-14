<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261111
  Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Modified Date: 20261114
-->
# Staff login and dashboards

The staff link in the public footer opens `/login`. Successful email and
password sign-in opens `/admin` or `/registrar` according to the signed-in
staff member's current role. Direct dashboard visits check for that route's
role. Invalid credentials and denied access leave the user at sign-in.

## Configure a test project

1. Use a Supabase test project with the team's existing `public.users` table.
   Apply `supabase/migrations/202611130001_sc13_admin_auth.sql` through the team's
   migration process. It adds an optional unique Auth UUID and keeps existing
   staff IDs and password hashes. Supabase Auth manages passwords for newly
   linked accounts, so their staff records can leave `password_hash` null.
   Then apply `supabase/migrations/202611140001_sc20_staff_portal_role.sql`.
   If admin sign-in already works, apply only the latter migration before
   deploying this branch.
2. Use separate confirmed test accounts for Admin and Registrar. As a database
   administrator, link each `public.users.auth_user_id` to its Auth user's UUID
   after verifying the identity. Set `role` to `admin` or `registrar`,
   `account_status` to `active`, and `must_change_password` to `false`. For a new
   row, enter `email` and `full_name`, leave `id` at its default, and set
   `password_hash` to `NULL`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in
   `.env.local`. Run `pnpm dev` and open `/login`. The sign-in flow uses
   the browser publishable key.

## SC-15 and SC-20 browser checks

| Check | Expected result |
| --- | --- |
| Open `/admin` and `/registrar` in a private window before signing in. | Both redirect to `/login`. |
| Sign in as Admin, reload, then enter `/registrar` directly. | The reload keeps `/admin` open. The Registrar route redirects to `/login`. |
| Sign in as Registrar, reload, then enter `/admin` directly. | The reload keeps `/registrar` open. The Admin route redirects to `/login`. |
| Try a wrong password, or sign in as a linked teacher, inactive staff member, or staff member required to change their password. | Sign-in fails and neither dashboard opens. |
| With the same dashboard open in two tabs, click **Sign out** in one. Reopen the protected route directly. | Both tabs return to `/login`. Reopening the protected route also redirects to `/login`. |
| On a test deployment, open a dashboard and disconnect the browser from the network before the token refreshes. Keep the tab open past the configured JWT lifetime from sign-in. | The open dashboard returns to `/login` when refresh can no longer extend the session. Reconnect and sign in again to resume. |

The expiry check can be run with a 5-minute JWT lifetime on a dedicated test
project. Keep `/login` loaded by signing in from that page first so it remains
available during the offline check. Record each case's observed result and the
Preview URL for peer review.

Supabase checks the caller's token before `get_staff_portal_role()` reads the
current staff assignment by Auth UUID. Only authenticated callers can execute
it, and the browser cannot read or write staff rows directly. The Registrar
landing page is protected by the route guard. Enrollment records and actions
need their own database or server authorization when they are added.

Run `pnpm lint`, `pnpm build`, and `pnpm test`. Component tests simulate Supabase
sessions, and the migration tests run the role checks in local PostgreSQL via
PGlite.
