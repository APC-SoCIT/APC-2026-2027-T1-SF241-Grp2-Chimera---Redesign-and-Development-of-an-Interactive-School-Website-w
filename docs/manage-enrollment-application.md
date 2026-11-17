# PB-09: Manage Enrollment Application (Registrar)

| | |
|---|---|
| **Backlog item** | PB-09 · Sprint 2 · 8 points · Owner: Gian Mandac |
| **User stories** | US-09 Manage Enrollment Applications · US-10 Review Application Details · US-11 Update Application Status · US-12 Print Enrollment Application |
| **Route** | `/registrar` (Registrar dashboard), shown only to an active Registrar account |
| **Status** | **Done**. Merged in fork PRs #3 and #4 (Nov 16, 2026), team PR #23; live since Nov 16 |

Implements the Registrar side of the use case diagram (`ucd.drawio`).

| Use case | Where it lives |
|---|---|
| Manage Enrollment Application | `RegistrarApplicationsPanel.vue` |
| «include» Search and Filter Application | Name/reference search, status filter, submitted-from/to dates → `search_registrar_applications` |
| «include» Review Application Details & Documents | `RegistrarApplicationDetail.vue` → `get_registrar_application` (all fields, parents/guardian, last school, uploaded documents, Next/Previous, not-found state) |
| «include» View Dynamic Requirement Checklist | `supabase/functions/_shared/requirements.ts` derives the list from grade level and applicant type; the Registrar ticks items received onsite → `set_application_requirement` |
| «include» Update Application Status & Registrar Remarks | Confirmation before saving → `update_application_status` (For Review / Complete / Incomplete; Pending is submission-only) |
| Trigger Outbound Status Email | **Not automatic.** After a status change, or with "Email applicant an update", the Registrar previews the email (status, remarks, received and missing requirements) and must confirm. Edge function `send-application-status-email` |
| «extend» Print A4 Verification Form | Browser print of the full record, checklist, remarks and signature lines. Printing never changes the application. |

> Diagram note: since the adviser requires the Registrar to confirm each email,
> Trigger Outbound Status Email behaves as an optional step. Consider drawing it as
> «extend» rather than «include» in the next diagram revision.

## Acceptance criteria

| Story | Criterion | Status |
|---|---|---|
| **US-09** | Only an authenticated Registrar can open the dashboard | ✅ |
| | Search by applicant name or reference number | ✅ |
| | Filter by processing status and submission date (from/to) | ✅ |
| | Selecting a result opens its details | ✅ |
| | The Registrar gets no account or scheduling administration | ✅ |
| **US-10** | Shows all submitted fields (incl. parents/guardian, last school) and any attached documents | ✅ |
| | An absent attachment is shown as absent and does not block the record | ✅ |
| | Attachments can be opened or downloaded through protected access | ⏸ Post-MVP: applicant uploads are disabled in Sprint 1, so there are no files to open |
| | Next / Previous loads the next application (across pages) | ✅ |
| | Unknown reference shows *Application not found* | ✅ |
| **US-11** | Status options For Review / Complete / Incomplete (Pending is submission-only) | ✅ |
| | Confirmation before saving; Cancel leaves the old status | ✅ |
| | Audit trail records Registrar, timestamp, old and new status | ✅ (`audit_logs`, action `application.status_change`) |
| | Labels describe completeness, not an admission decision | ✅ (stated in the screen and in the email) |
| **US-12** | A4 print/PDF layout with all submitted fields and the reference number | ✅ (one A4 page; also opens in a new tab for *Save as PDF*) |
| | Printing does not change the status or resubmit | ✅ |
| | Re-encoding into the legacy enrollment database happens outside the system | ✅ (by design, swimlane step 4) |
| **Use case diagram additions** | Dynamic requirement checklist (by grade level and applicant type) | ✅ |
| | Registrar remarks | ✅ |
| | Status email, only after the Registrar previews and confirms it | ✅. Delivers to any address once `EMAIL_FROM` uses a Resend-verified domain |

**Tests:** `server/admin-auth-migration.test.ts` (Registrar functions, filters, audit trail,
table lockdown), `src/components/RegistrarApplicationDetail.test.ts`,
`src/components/StaffPortalPanels.test.ts`, `src/lib/enrollment/requirements.test.ts`,
`src/lib/enrollment/print-form.test.ts`.

**Suggested backlog updates:** PB-09 → *Done*; add the checklist, remarks, confirmed email
and "Print A4 Verification Form" to the scope notes; mark US-10 attachment access Post-MVP;
note that the email uses Resend, a third-party service that needs client approval under the SOW.

## Security

- The browser never reads or writes `enrollment_applications`, `application_guardians`,
  `application_documents`, `application_requirement_checks` or `audit_logs`.
  Every action is a `SECURITY DEFINER` function that rechecks
  `get_staff_portal_role() = 'registrar'` (active account, live session, no pending
  password change).
- Status changes, requirement checks and sent/failed emails are written to `audit_logs`
  with the acting Registrar.
- The email function requires a Registrar session, reads the recipient and content from
  the database (never from the request) and HTML-escapes applicant and Registrar text.

## Deploying

1. **Database.** Apply `supabase/migrations/202611160001_manage_enrollment_application.sql`.
   It removes two policies that were added by hand in the dashboard
   ("Temporary enrollment viewing" and "Allow staff updates on enrollment applications"),
   revokes direct table access, drops the `notify-application-status-change` webhook
   (it emailed on every update and pointed at a mistyped project URL), creates
   `application_requirement_checks` and the Registrar functions.
2. **Edge function.** Deploy `send-application-status-email` together with
   `supabase/functions/_shared/requirements.ts`
   (`supabase functions deploy send-application-status-email`).
3. **Function secrets.** `RESEND_API_KEY` (already set). Optional: `EMAIL_FROM` (a sender
   on a domain verified in Resend; the default `onboarding@resend.dev` can only deliver to
   the Resend account owner's address) and `APP_ORIGIN` (the site origin, to restrict CORS).

## Undo

`supabase/rollback/202611160001_manage_enrollment_application_rollback.sql` restores the
database exactly as it was before the migration (applied to the live project on
2026-11-16). It re-opens applicant data to every signed-in account, so use it only in an
emergency.

## Not in scope yet

Applicant document uploads remain disabled (post-MVP), so documents are listed when
present but there are no signed download links yet.
