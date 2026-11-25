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
focus, and every 30 seconds while visible. Errors display retry feedback.
Database mode does not substitute built-in notices while loading or after a
failure, because an Admin may have hidden those original notices. A database
build also omits those notices from prerendered HTML.

## Required database update

After the existing `202611260001_pb01_cms_database.sql` migration, apply
`202611260002_pb01_public_content_visibility.sql` through the team's migration
process before hosting this change in database mode. The new migration:

- adds an explicit content visibility column, preserving legacy public content;
- filters private records in `cms_public_content()` before they reach a visitor;
- returns actual visibility to the existing Admin workspace;
- preserves the existing public RPC response shape, staff authorization, and
  content save function. Editing an existing private record retains its visibility.

Keep the existing `VITE_CMS_DATABASE=true` and public Supabase configuration for
the connected CMS. This work has not applied migrations to the shared database,
changed hosting settings, or deployed the website.

## Regression checks

The migration test executes the team's actual schema and migrations in PGlite,
creates published private announcements and pages, edits them through the existing
CMS, and verifies that anonymous public records and derived search results exclude
them. Published public records remain visible. The Admin can still list the private
records and their actual visibility.

Frontend tests additionally check that the shared public adapter and search both
reject private, draft, archived, and trashed records, even if supplied in an RPC
response. They cover publication refresh, no fallback on database failure, and
private-content-safe prerendering. Existing popup keyboard and responsive behavior
is retained.

Run `npm test`, `npm run typecheck`, and `npm run build` before review. No push or
deployment is included in this local rebase.
