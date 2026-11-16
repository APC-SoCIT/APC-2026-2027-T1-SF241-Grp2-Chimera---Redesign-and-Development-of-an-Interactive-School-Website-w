# Manage Enrollment Application (Registrar)

Implements the Registrar side of the use case diagram (`ucd.drawio`). Route: the
staff dashboard, shown only to an active Registrar account.

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

## Not in scope yet

Applicant document uploads remain disabled (post-MVP), so documents are listed when
present but there are no signed download links yet.
