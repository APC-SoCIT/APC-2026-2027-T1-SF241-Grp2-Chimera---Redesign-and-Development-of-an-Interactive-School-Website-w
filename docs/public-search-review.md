# Public search and CMS visibility

This branch rebases the search popup onto the team's CMS on `main`. It retains
the Admin dashboard at `/admin`, the existing content workspace at
`/admin/content`, the staff sign-in and role guard, editor, file storage,
publication controls, archive restoration, and Undo/Redo.

The parallel Express CMS, local database launcher, separate CMS login, and
`VITE_CMS_SERVER` / `VITE_CMS_LOCAL` configuration have been removed from this
change. The pre-rebase work is preserved on the local backup branch
`backup/20261120-Terrence-Corpuz-before-main-rebase-4970a78`.

## One content source

The header search icon opens a responsive modal with a translucent backdrop.
Submitting opens `/search?q=...`. Results include a title, plain-text excerpt,
and link; unmatched keywords show **No results found**.

`usePublicSearch()` reads `usePublicWebsite()`, the same adapter used by the
public news and institutional pages. In database mode it calls the existing
anonymous `cms_public_content()` RPC. It does not call a second CMS or search
API. Browser-preview mode uses the existing browser CMS library.

Both public rendering and keyword matching use `isPubliclyVisible()`:

- status is `published`;
- visibility is `public`;
- the item is outside Trash.

Search refreshes the shared data when its keyword changes, the page regains
focus, and every 30 seconds while visible. Background refreshes keep the last
verified results on screen and preserve focus on unchanged links. The next
successful response removes anything that is no longer public. A failed request
clears the CMS results and shows a retry. Announcements and school pages show a
loading state while checking for content that is missing from the current
response. Database builds omit built-in notices from prerendered HTML because
an Admin may have hidden them.

## Required database update

After the existing `202611260001_pb01_cms_database.sql` migration, apply
`202611260002_pb01_public_content_visibility.sql` through the team's migration
process before hosting this change in database mode. The new migration:

- adds an explicit content visibility column, preserving legacy public content;
- filters private records in `cms_public_content()` before they reach a visitor;
- returns actual visibility to the existing Admin workspace;
- preserves the existing public RPC response shape, staff authorization, and
  content save function. Editing an existing private record retains its visibility.

## Merge and production rollout

The `main` workflow deploys using Vercel's current production settings. With
database mode off, the site searches its built-in public content. To turn on
live CMS search, use the following order:

1. Apply the visibility migration through the team's migration process.
2. Publish the initial approved announcements, events, and school pages in
   Supabase through the existing CMS on a restricted preview connected to the
   school database. Confirm the approved content is visible in that preview.
3. Set `VITE_CMS_DATABASE=true` alongside the public Supabase configuration in
   Vercel production and redeploy. Check `/news`, a direct announcement link,
   and `/search` after deployment.

## Regression checks

The migration test executes the team's actual schema and migrations in PGlite,
creates published private announcements and pages, edits them through the existing
CMS, and verifies that anonymous public records and derived search results exclude
them. Published public records remain visible. The Admin can still list the private
records and their actual visibility.

Frontend tests check the shared public adapter and search against private,
draft, archived, and trashed records. They also cover focus during a background
refresh, a newly published announcement loading from the database, withdrawal
of previously published content, and recovery after a database failure.

Run `pnpm test`, `pnpm typecheck`, and `pnpm build` before merging.
