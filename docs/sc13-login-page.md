<!--
  Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
  Created Date: 20261111
-->
# SC-13: Staff login page — UI first

Route: `/login`. The public footer links to the staff portal. This page uses the
existing school seal, campus photo, red/gold/cream tokens, and typefaces. It has a
dedicated responsive layout, labelled email/password inputs, password visibility,
field validation with focus management, and administrator-assisted reset guidance.

This change is a design preview, not completed authentication. Submitting valid
fields displays an unavailable message; credentials are never transmitted or
stored. No dashboard, session, role claim, or protected route is simulated.

SC-13 still needs an authenticated Supabase session, a verified active Admin role,
and a protected dashboard route. The existing `getPublicSupabaseClient()` is for
anonymous PB-11 resource downloads and explicitly disables session persistence;
do not silently repurpose it. Coordinate the role source and authorization rules
with the team's database before connecting the form. Password reset/deactivation
remain in the account-management workstream. Session expiry/logout tests belong
to SC-15. Keep the Jira issue open until its full acceptance criteria pass.

Checks: run `pnpm test`, `pnpm lint`, and `pnpm build`. Review `/login` at desktop
and phone widths, including keyboard navigation and validation states.

## Verification in this session

- ESLint, Vue/TypeScript checks, and the Vite production build passed.
- All four login component tests passed; the wider run passed 120 tests.
- The 66 existing enrollment HTTP tests failed with loopback `EACCES` errors in
  this environment, so the full suite is not green.
- Browser preview was blocked by a connection timeout and inaccessible minimized
  browser windows. Desktop/mobile visual review remains outstanding.

The terminal could not reach GitHub. The working copy was restored from verified
GitHub objects at main commit `06b88a93c36381cf5a34c775eba236059b4b1bf0`, with its
original commit and tree hashes preserved and the supplied repository as origin.
It is a shallow, sparse checkout: the two unrelated PDF references under
`docs/reference-site/forms/` were excluded because their bytes were unavailable
through the connection. Normal source files and public images are present.
