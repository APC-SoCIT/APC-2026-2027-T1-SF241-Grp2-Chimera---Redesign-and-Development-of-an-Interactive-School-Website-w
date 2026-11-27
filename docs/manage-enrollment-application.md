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
| Trigger Outbound Status Email | **Not automatic.** After a status change, or with "Email applicant an update", the Registrar previews the email (status, remarks, the documents still to bring for onsite verification, received requirements, office hours and address) and must confirm. Sent from the Vercel backend through Gmail (`POST /api/staff/status-email`, `server/status-email.ts`) to the applicant's own email address. |
| «extend» Print A4 Verification Form | Browser print of the full record, checklist, remarks and signature lines. Printing never changes the application. |

> Diagram note: since the adviser requires the Registrar to confirm each email,
> Trigger Outbound Status Email behaves as an optional step. Consider drawing it as
> «extend» rather than «include» in the next diagram revision.

## Checklist and enrollment form in sync (Nov 19, 2026)

The requirement checklist is built by one shared set of rules
(`supabase/functions/_shared/requirements.ts`) and is now used in **four places that
always match**: the applicant's form, the Registrar's review panel, the printed A4
verification form and the status email.

| The applicant answers on the form | The checklist then |
|---|---|
| Student status, school level, grade | Chooses the list (old student, preschool, Grade 1/7/11 entry, or transferee/returnee rules) |
| Religion | Shows **Baptismal certificate** for Catholic applicants, **Certificate of dedication** for others |
| Former school's name (preschool) | Makes the report card **required** if the child attended a school, otherwise "if applicable" |

Form changes:
- **"What to bring to the Registrar's Office"** is shown on the review step and on the
  receipt, so families bring exactly what the Registrar will tick.
- **Former school's name is required** for new students and returnees above pre-school
  (the report card, good moral and recommendation come from that school). It stays
  optional for old students and pre-school.
- The **Student status** hint explains that transferees choose *New*.
- The Registrar panel and print form use the **same labels as the form** (Student status,
  School level, Birthday, Contact number, Parent's email address, Messenger account,
  Former school's name and address).

No database change: requirement keys are unchanged, so checklist ticks already saved
still apply. Redeploy the `send-application-status-email` edge function so emails use the
new wording.

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
2. **Gmail sender.** Status emails are sent by `server/status-email.ts` through a dedicated
   Gmail account, so they reach any applicant address without owning a domain. Turn on
   2-Step Verification for that account, create an App Password
   (https://myaccount.google.com/apppasswords) and add these Vercel environment variables
   (Production): `GMAIL_USER` (the Gmail address) and `GMAIL_APP_PASSWORD` (the App
   Password, marked Sensitive). The route also uses `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY`, which are already set. Without the Gmail variables the
   Registrar sees "The status email could not be sent" and the attempt is audited as failed.
   Gmail allows about 500 messages a day. Replies go to the Registrar's address.
3. **Old edge function.** `send-application-status-email` (Resend) is no longer called.
   Resend's test sender only delivers to the Resend account owner, so applicants never
   received it. Remove the function from Supabase once this change is live.

## Undo

`supabase/rollback/202611160001_manage_enrollment_application_rollback.sql` restores the
database exactly as it was before the migration (applied to the live project on
2026-11-16). It re-opens applicant data to every signed-in account, so use it only in an
emergency.

## Not in scope yet

Applicant document uploads remain disabled (post-MVP), so documents are listed when
present but there are no signed download links yet.
