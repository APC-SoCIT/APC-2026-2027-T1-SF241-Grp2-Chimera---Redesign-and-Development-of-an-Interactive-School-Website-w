-- Author: Gian Mandac
-- Created Date: 20261116
-- UNDO for migrations/202611160001_manage_enrollment_application.sql.
-- Restores the database exactly as it was before that migration (captured from the live
-- project on 2026-11-16), including the open access rules that migration removed.
-- WARNING: running this re-opens applicant data to every signed-in account and deletes
-- any requirement checklist ticks recorded after the migration. Applications, staff
-- accounts and audit logs are not touched. The new Registrar page stops working.

begin;

drop function if exists public.search_registrar_applications(text, text, date, date, integer);
drop function if exists public.get_registrar_application(text);
drop function if exists public.set_application_requirement(text, text, boolean);
drop function if exists public.update_application_status(text, text, text);
drop function if exists public.record_status_email(text, text, boolean);
drop function if exists public.require_registrar();
drop table if exists public.application_requirement_checks;

-- Previous grants (Supabase defaults, as found on the live project).
grant all on public.application_guardians, public.application_documents, public.audit_logs to anon, authenticated;
grant all on public.enrollment_applications to authenticated;
grant delete, insert, references, trigger, truncate, update on public.enrollment_applications to anon;

-- Previous dashboard-created policies.
create policy "Temporary enrollment viewing" on public.enrollment_applications
    for select to authenticated using (true);
create policy "Allow staff updates on enrollment applications" on public.enrollment_applications
    for update to public using (true) with check (true);

-- Previous webhook, recreated as found (its URL host was mistyped, so it never delivered).
create trigger "notify-application-status-change"
after update on public.enrollment_applications
for each row execute function supabase_functions.http_request(
    'https://ddjfwiaifkpmlnyrsnx.supabase.co/functions/v1/send-application-status-email',
    'POST', '{"Content-type":"application/json"}', '{}', '5000');

commit;
