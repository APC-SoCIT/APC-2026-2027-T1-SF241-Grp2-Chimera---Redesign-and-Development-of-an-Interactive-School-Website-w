# SNCS Management System

This repository contains the Sto. Niño Catholic School (SNCS) management-system
project, including **PB-10: Public Website Content**, **PB-11: Public Resource
Downloads**, and **PB-12: Online Enrollment Application**. The Vue.js website
serves public TLC PDFs from Supabase and supports Pre-school, Elementary, JHS,
and SHS application forms through an Express API, Turnstile, and Supabase persistence.

Start with [the enrollment setup guide](docs/enrollment-setup.md) for environment
variables, Supabase and Turnstile credentials, local development, and Vercel
branch previews. See [PB-12 implementation and field mapping](docs/pb12-enrollment.md)
for the feature details. The application route is `/enrollment`; live submission
requires the API and a working connection to the existing team database.
No database migration is required.

## Technology alignment

The project follows the architecture proposed in the SSYSADD1 paper:

- **Frontend:** Vue 3, Vue Router, TypeScript, and Vite
- **Backend:** Node.js with Express (PB-12 enrollment API)
- **Data and files:** Supabase PostgreSQL and public TLC PDFs in Supabase Storage;
  enrollment document uploads are disabled
- **Staff authentication:** Supabase Auth with role-checked staff routes
- **Scheduling (future backlog):** a separate Python service using Google OR-Tools

The browser-local CMS design preview is available at `/admin/content` when enabled;
Admins open it from the Admin dashboard after signing in through the staff portal.
See [CMS preview deployment](docs/cms-preview-deployment.md) for its setup.
The Supabase staff portal starts at `/login`; its protected Admin dashboard is `/admin`.
Registrar and Teacher dashboards retain their existing paths.
See [staff login setup](docs/sc13-login-page.md) and
[Registrar workflow](docs/manage-enrollment-application.md) for configuration.
Shared CMS persistence and scheduling remain future work.

An isolated [local scheduling preparation workbench](services/scheduler/README.md)
now supports coordinator entry, SNCS Excel import preview, validation, CP-SAT
generation, and local draft/publication testing. Academic Coordinators now open it
from their signed-in dashboard through a role-checked API gateway. Scheduling
storage remains in the Python service's SQLite database. See [coordinator setup](docs/coordinator-scheduling-setup.md)
and [Sprint 3 scope and remaining school decisions](docs/scheduling-preparation.md).

## PB-10 public website

- Responsive Home, About, Campus, News, Events, Contact, and Admissions routes
- Sourced school history, updated mission/vision, six core values, and separate motto
- Announcement details, date-range events with upcoming/past separation, and office contacts
- Optional announcement images with descriptive alternative text and full-size detail views
- Six applicant checklists and reusable student-service links
- Existing alumni sections preserved pending the client's decision
- SNCS red-and-gold visual identity derived from the existing website
- Typed, CMS-ready content models with publication-status and visibility controls
- Public-content selector tests that exclude draft, private, and archived records
- Philippine calendar-date tests for ongoing events and date ranges
- Publicly available campus images retained as temporary source-site assets

## Local development

Use Node.js 22.12+ and pnpm.

```bash
pnpm install
pnpm dev
```

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The Vite development server prints the local URL after it starts. For production,
configure the host to serve `index.html` as the fallback for Vue Router paths.

## Supabase setup for PB-11

Vercel and local environment configuration use `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Copy `.env.example` to `.env.local` for a new
checkout and use the Supabase project's public configuration values.

Run `pnpm check:supabase` for API/key connectivity, or `pnpm check:resources` for
read-only checks of the two published TLC records, original PDF hashes and
anonymous column restrictions. `/resources` groups live public/published PDFs
and starts downloads in two desktop clicks or three phone taps from Home.
See [the setup notes](docs/supabase-setup.md) and
[PB-11 implementation notes](docs/pb11-preparation.md) for applied migration,
seed and verification details.

## Content integration boundary

The implemented content batch follows the
[PB-10 content and design plan](docs/pb10-content-design-plan.md), with sources,
page layouts, CMS mapping, and a three-click task checklist. Local checks and
screenshots are recorded in [PB-10 verification](docs/verification/pb10-verification.md). See
[PB-11 implementation](docs/pb11-preparation.md) for the two published TLC PDFs
and download verification. Alumni remains on hold pending the client
decision; its existing markup and assets are unchanged.

Temporary content lives under `src/lib/content`. Components consume typed selector
functions rather than importing raw records directly. The future CMS adapter can
replace this data source while preserving the page components and enforcing the
same `published` and `public` visibility contract. This frontend filter is not a
database access policy: a future backend must return only public records and
enforce authorization before sending data to the browser. Resource reads already
use RLS and limited column grants. The CMS design preview stores edits and
uploaded images in each browser. Shared CMS content adapters and production
staff authentication remain pending. PB-12 adds enrollment
submission; live use requires the server configuration described above.

## Asset note

Images under `public/images/source-site` were obtained from the existing public
SNCS website for redesign prototyping. See
[`docs/brand-and-asset-audit.md`](docs/brand-and-asset-audit.md) for provenance and
replacement guidance. Client-approved original files should replace them before
production release.
