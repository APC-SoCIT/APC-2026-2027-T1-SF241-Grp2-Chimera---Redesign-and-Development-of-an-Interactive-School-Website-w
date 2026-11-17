# Backlog status: Gian Mandac's items

Checked against `Team_Chimera_Product_Backlog_ALIGNED_2026-10-14.xlsx` (the newest backlog)
and the code in this repository. Last updated 17 Nov 2026.

| ID | Sprint | Points | Item | Backlog says | Actual |
|---|---|---|---|---|---|
| **EN-01** | 1 | 3 | Repository, hosting, Supabase project and Sprint 1 tables | Done | ✅ **Done** |
| **PB-03** | 2 | 3 | Admin / Academic Coordinator login (US-13, US-27) | Not Started | 🟡 **In progress**: Admin ✅, Academic Coordinator ❌ |
| **PB-09** | 2 | 8 | Registrar: list, review, update status, print applications (US-09–US-12) | Not Started | ✅ **Done** |
| **PB-07** | 3 | 5 | Teacher: view my published class schedule (US-07) | Not Started | ✅ **Built**: shows data once PB-02 publishes a schedule |

## EN-01: Done

| Acceptance criterion | Evidence |
|---|---|
| Shared Git repository with agreed branching rules | Team repository plus this fork; workflow in [README §6](../README.md#6-working-with-the-team-repository) |
| Supabase project with content, resource and enrollment tables | `cms_content`, `resources`, `enrollment_periods`, `enrollment_applications` |
| Resource files in Supabase Storage | `resource-files` bucket (2 published PDFs) |
| Frontend deployed to a shareable URL | https://manage-enrollment-application.vercel.app |

## PB-03: In progress

- **US-13 Admin login: done.** Required fields with highlighting, active-account, role and
  live-session checks, generic error, revoked/expired sessions blocked, forced change of a
  temporary password, non-Admins cannot manage accounts. Code: `src/views/LoginView.vue`,
  `src/router/index.ts`, `src/lib/staff-auth.ts`, migrations `sc13`–`sc19`. The login code was
  mostly written by Jan Samuel Sultan (SC-13 to SC-30).
- **US-27 Academic Coordinator login: not possible yet.** The database only allows the roles
  `teacher`, `registrar` and `admin`; there is no Coordinator dashboard. Needs a team decision
  (add the role in a migration, the account screen, a route and a dashboard).

## PB-09: Done
See [manage-enrollment-application.md](manage-enrollment-application.md) for every
acceptance criterion. One criterion is Post-MVP: opening attachments (applicant uploads are disabled).

## PB-07: Built
See [pb07-teacher-schedule.md](pb07-teacher-schedule.md). The Teacher dashboard shows the
signed-in Teacher's published classes. It shows *No active classes found* until **PB-02**
(Jan, Sprint 3) generates and publishes a schedule.

## Backlog file corrections to make

1. **Progress:** PB-09 → Done; PB-03 → In Progress; PB-07 → Done (pending PB-02 data);
   PB-11 → Done (the Sprint Schedule says Done; the ALIGNED file says In Progress).
   PB-08 (Registrar login) and PB-06 (Teacher login) are also working in the system.
2. **Approval:** change "Review required" to Approved for built items.
3. **PB-09 scope note:** add the requirement checklist, registrar remarks, Registrar-confirmed
   status email (Resend, a third-party service needing client approval) and the
   "Print A4 Verification Form".
4. **Schema references that do not match the live database:**

| Backlog / User Stories say | Live database |
|---|---|
| Academic Coordinator role | Roles: `teacher`, `registrar`, `admin` only |
| `staff_privileges` with `expires_at` (PB-05 temporary grants) | Not present; only a `users.manage_staff_accounts` flag |
| `specialized_constraints` | Not present; `teacher_unavailability` and `fixed_schedules` exist |
| `sections.room_name` / `room_number`, `subjects.special_room` | Not present; rooms come from `rooms` via `schedule_entries.room_id` |

Either schedule these as planned work, or update the backlog and user stories to the
current design.
