# SNCS Management System

Redesigned public website and administrative portal for **Sto. Niño Catholic School,
Inc. (SNCS)**, Signal Village, Taguig City. Built by **Team Chimera** (Asia Pacific
College, SSYSADD1 / PBL 2026–2027): Gian Mandac, Miles Angelo Gemillan, Jan Samuel
Sultan and Terrence Josh Corpuz, advised by Prof. Felino Calderon.

| | |
|---|---|
| **Live site** | https://manage-enrollment-application.vercel.app |
| **Staff sign-in** | https://manage-enrollment-application.vercel.app/login |
| **This repository** | `Mandacgian05/manage-enrollment-application`, a fork of the team repository `APC-SoCIT/APC-2026-2027-T1-SF241-Grp2-Chimera---Redesign-and-Development-of-an-Interactive-School-Website-w` |
| **Team branch it feeds** | `feat/pb-09-manage-enrollment-application` (merged through team PR #23) |

---

## 1. What the system does

| Backlog item | Feature | Who uses it | Status |
|---|---|---|---|
| PB-10 | Public website: Home, About, Campus, News, Events, Contact, Admissions | Public | Done |
| PB-11 | Download official forms and references by category (`/resources`) | Public | Done |
| PB-12 | Online enrollment application with CAPTCHA and rate limit (`/enrollment`) | Public | Done |
| EN-01 | Repository, hosting, Supabase project and tables | Team | Done |
| PB-03 / PB-08 / PB-06 | Staff sign-in with role-based dashboards (Admin, Registrar, Teacher) | Staff | Done |
| PB-05 | Admin: create staff accounts, assign roles, reset passwords, deactivate | Admin | Done |
| **PB-09** | **Manage Enrollment Application** (search, review, checklist, status, email, print) | Registrar | **Done** |
| PB-01 | CMS for website content | Admin | Not started |
| PB-02 / PB-07 | AI-assisted class scheduling and teacher schedule view | Coordinator / Teacher | Not started |

### Manage Enrollment Application (PB-09)

Follows the use case diagram (`ucd.drawio`) from the SSYSADD1 documents:

| Use case | What the Registrar sees |
|---|---|
| Manage Enrollment Application | Registrar dashboard at `/registrar` |
| «include» Search and Filter Application | Search by name or reference number; filter by status and submitted-from/to dates |
| «include» Review Application Details & Documents | Every submitted field, parents/guardian, last school, uploaded documents, Next/Previous |
| «include» View Dynamic Requirement Checklist | Requirements based on grade level and applicant type; tick each item as it is presented onsite |
| «include» Update Application Status & Registrar Remarks | For Review / Complete / Incomplete with remarks; confirmation before saving; every change is audited |
| Trigger Outbound Status Email | **Never automatic.** The Registrar previews the email (status, remarks, received and missing requirements) and confirms before it is sent |
| «extend» Print A4 Verification Form | One-page A4 form with all details, checklist, remarks and signature lines; also opens in a new tab for "save as PDF" |

Details: [docs/manage-enrollment-application.md](docs/manage-enrollment-application.md).

### Pages

| Route | Page |
|---|---|
| `/`, `/about`, `/campus`, `/news`, `/news/:slug`, `/events`, `/contact`, `/admissions` | Public website |
| `/resources` | Downloadable forms (PDF) |
| `/enrollment` | Online enrollment application |
| `/login`, `/login/change-password` | Staff sign-in and required password change |
| `/admin` | Admin dashboard: staff account management |
| `/registrar` | Registrar dashboard: Manage Enrollment Application |
| `/teacher` | Teacher dashboard (schedule view is future work) |

---

## 2. Technology

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vue Router, TypeScript, Vite |
| Enrollment API | Node.js + Express, deployed as Vercel functions (`api/`) |
| Database, auth, files | Supabase: PostgreSQL with row-level security, Supabase Auth, Storage (public PDFs) |
| Email | Supabase Edge Function `send-application-status-email` → Resend |
| Anti-spam | Cloudflare Turnstile CAPTCHA + 5 submissions per IP per hour |
| Hosting | Vercel (project `manage-enrollment-application`, team SNCS-PBL-2026) |
| Tests | Vitest, Vue Test Utils, PGlite (runs the real migrations in memory) |
| Scheduling (planned) | Separate Python service with Google OR-Tools |

### Repository layout

```
api/                     Vercel function entry points (enrollment, staff accounts)
server/                  Express app: enrollment API, staff account API, tests
src/
  components/            Vue components (Registrar panels, staff panels, site chrome)
  lib/content/           Typed public content (CMS-ready) and selectors
  lib/enrollment/        Enrollment form rules, Registrar data access, checklist, print form
  lib/resources/         Public resource downloads
  views/                 One view per route
  router/                Routes and staff role guards
supabase/
  migrations/            Database changes, applied in filename order
  rollback/              Undo scripts for migrations
  functions/             Edge functions (+ _shared code used by both browser and function)
  reference/             Team schema (SNCS_Schema_Final.sql)
docs/                    Feature notes, setup guides, verification evidence
scripts/                 Connectivity and data checks
```

---

## 3. Running it locally

Requires **Node.js 22.12+** and **pnpm** (version pinned in `package.json`).

```bash
pnpm install
cp .env.example .env.local     # browser settings
cp .env.example .env           # server settings (only needed for the enrollment API)
pnpm dev                       # website on the URL Vite prints
pnpm dev:server                # enrollment + staff API on http://127.0.0.1:3001 (proxied at /api)
```

### Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | browser (`.env.local`, Vercel) | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser (`.env.local`, Vercel) | Supabase publishable key (`sb_publishable_…`) |
| `SUPABASE_URL` | server | Supabase project URL |
| `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) | server, **secret** | Reads the open enrollment period; staff account admin |
| `DATABASE_URL` | server, **secret** | Supabase transaction pooler connection for saving applications |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | server (secret key is **secret**) | Cloudflare Turnstile CAPTCHA |
| `TURNSTILE_HOSTNAME`, `APP_ORIGIN` | server | Site hostname and origin allowed to submit |
| `IP_HASH_SECRET` | server, **secret** | 32+ random characters; hashes IPs for the rate limit |

Never put secrets in `VITE_` variables, and never commit `.env` or `.env.local`
(both are git-ignored). Full walkthrough: [docs/enrollment-setup.md](docs/enrollment-setup.md).

> The live Vercel project currently has only the two `VITE_` variables. Staff sign-in,
> the Registrar and Admin dashboards and `/resources` work; the public **enrollment
> form needs the server variables** above before it can accept submissions there.

### Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test        # 22 test files, 268 tests
pnpm build
```

`pnpm check:supabase` and `pnpm check:resources` run read-only checks against the
configured Supabase project.

---

## 4. Database (Supabase)

Project: **`ddjfwiaifkpmlnyrsxnx`** ("Mandacgian05's Project", Tokyo region).
Base schema: [`supabase/reference/SNCS_Schema_Final.sql`](supabase/reference/SNCS_Schema_Final.sql).

### Migrations

Applied in filename order. All are applied to the live project.

| Migration | Adds |
|---|---|
| `202610010001_pb12_enrollment.sql`, `202610010002_pb12_schema_alignment.sql` | Retired no-ops (PB-12 uses the existing schema) |
| `202610020001_pb11_public_resources.sql` | Public, read-only access to published resources |
| `202611130001_sc13_admin_auth.sql` | Links staff records to Supabase Auth |
| `202611140001_sc20_staff_portal_role.sql` | `get_staff_portal_role()` for dashboard routing |
| `202611140002_sc18_manage_staff_accounts.sql` | Staff account management functions |
| `202611140003_sc21_registrar_application_access.sql` | First Registrar list function |
| `202611140004_sc19_sc30_staff_access.sql` | Live-session checks, password reset, deactivation, audit |
| `202611160001_manage_enrollment_application.sql` | PB-09: Registrar functions, checklist table, data lockdown |

Undo for the latest migration: [`supabase/rollback/`](supabase/rollback/). It re-opens
applicant data to every signed-in account, so use it only in an emergency.

### Security model

- The browser **never reads or writes enrollment tables directly**. Every staff action
  calls a `SECURITY DEFINER` database function that rechecks the caller's role, active
  account and live session (for example `search_registrar_applications`,
  `update_application_status`).
- Public enrollment submissions are saved by the server over `DATABASE_URL`, after
  CAPTCHA and rate-limit checks.
- Status changes, checklist ticks, sent/failed emails and staff account changes are
  written to `audit_logs` with the acting staff member.
- Personal data is handled under the Philippine Data Privacy Act of 2012 (see the SOW).

### Status email

Edge function `supabase/functions/send-application-status-email` (deployed, version 2).
It requires a Registrar session, reads the recipient and content from the database,
and escapes all text. Secrets: `RESEND_API_KEY` (set); optional `EMAIL_FROM` and
`APP_ORIGIN`.

> Until `EMAIL_FROM` uses a sender on a domain verified in Resend, emails are sent from
> Resend's test address and are **only delivered to the Resend account owner's email**.

---

## 5. Deployment

Pushing to `main` deploys to production on Vercel automatically; other branches get
preview URLs. Vercel serves `index.html` for all non-`/api` paths (`vercel.json`).

A change that needs a database update must be deployed **together** with its
migration: apply the migration right after merging, or the affected pages will show
errors until it is applied.

---

## 6. Working with the team repository

```
APC-SoCIT/…Chimera…  (team repository)
  └─ feat/pb-09-manage-enrollment-application   ← receives this fork through pull requests
Mandacgian05/manage-enrollment-application      (this fork)
  └─ main                                       ← deployed to the live site
```

1. Work on a branch in this fork, open a pull request into the fork's `main`, and merge
   after the checks pass.
2. To share it with the team, open a pull request from **this fork's `main`** into the
   team branch: on GitHub choose **compare across forks**; base repository = team repo,
   base = `feat/pb-09-manage-enrollment-application`; head repository = this fork,
   compare = `main`.
3. To bring teammates' work in, use **Sync fork** (team `main`) or a pull request from
   the team branch into this fork.

History: fork PRs #1–#4 (PB-09 redesign, use-case implementation, print fix) → team
PR #23 merged into `feat/pb-09-manage-enrollment-application` on 16 Nov 2026.

---

## 7. More documentation

| Document | Covers |
|---|---|
| [manage-enrollment-application.md](docs/manage-enrollment-application.md) | PB-09 Registrar workflow, security, deployment, undo |
| [enrollment-setup.md](docs/enrollment-setup.md) | PB-12 environment variables, Supabase, Turnstile, Vercel |
| [pb12-enrollment.md](docs/pb12-enrollment.md) | PB-12 implementation and field mapping |
| [sc13-login-page.md](docs/sc13-login-page.md) | Staff sign-in and role-based dashboards |
| [pb11-preparation.md](docs/pb11-preparation.md), [supabase-setup.md](docs/supabase-setup.md) | PB-11 resources, storage and access rules |
| [pb10-content-design-plan.md](docs/pb10-content-design-plan.md) | PB-10 content sources, layouts and CMS mapping |
| [verification/](docs/verification/) | PB-10 and PB-11 test evidence and screenshots |
| [brand-and-asset-audit.md](docs/brand-and-asset-audit.md) | Image provenance; replace source-site photos before production |

## 8. Known limitations

- Applicant document uploads are disabled (post-MVP); requirements are presented onsite.
- The live Vercel project lacks the enrollment server variables (see section 3).
- Status emails need a Resend-verified sender domain to reach real applicants.
- The separate `testt` Vercel project uses the same database but older code; its
  Registrar page no longer loads applications. Use the live site above instead.
- CMS (PB-01) and scheduling (PB-02, PB-07) are not built yet; the alumni section is on
  hold pending the client's decision.
