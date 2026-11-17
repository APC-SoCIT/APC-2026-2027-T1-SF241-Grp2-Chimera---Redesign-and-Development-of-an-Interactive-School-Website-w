-- Author: Gian Mandac
-- Created Date: 20261117
-- PB-07 / US-07 View Class Schedule (Teacher).
-- A signed-in Teacher sees only their own meetings from the published schedule run.
-- Drafts, failed and superseded runs stay hidden. Viewing is read-only.

begin;

-- Live Schema Alignment START
-- The live project already has rooms, schedule_entries.room_id and schedule_entries.is_fixed,
-- which supabase/reference/SNCS_Schema_Final.sql does not show. These statements record them
-- in the repository and do nothing where they already exist.
create table if not exists public.rooms (
    id        smallint generated always as identity primary key,
    name      text not null unique,
    is_active boolean not null default true
);
alter table public.rooms enable row level security;
revoke all on public.rooms from public, anon, authenticated;

alter table public.schedule_entries
    add column if not exists room_id smallint references public.rooms(id),
    add column if not exists is_fixed boolean not null default false;
-- Live Schema Alignment END

-- Teacher Schedule START
create function public.get_teacher_schedule()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
    teacher public.teachers%rowtype;
    run record;
begin
    if public.get_staff_portal_role() is distinct from 'teacher' then
        raise insufficient_privilege using message = 'Teacher access required';
    end if;

    select t.* into teacher
    from public.teachers t
    join public.users u on u.id = t.user_id
    where u.auth_user_id = auth.uid();

    if not found then
        return jsonb_build_object('linked', false, 'run', null, 'entries', '[]'::jsonb);
    end if;

    -- The active term's published run; otherwise the most recently published run.
    select r.id, r.published_at, tm.school_year, tm.name as term_name into run
    from public.schedule_runs r
    join public.terms tm on tm.id = r.term_id
    where r.status = 'published'
    order by tm.is_active desc, r.published_at desc nulls last, r.id desc
    limit 1;

    if not found then
        return jsonb_build_object('linked', true, 'teacher_name', teacher.full_name, 'run', null, 'entries', '[]'::jsonb);
    end if;

    return jsonb_build_object(
        'linked', true,
        'teacher_name', teacher.full_name,
        'run', jsonb_build_object('school_year', run.school_year, 'term', run.term_name, 'published_at', run.published_at),
        'entries', coalesce((
            select jsonb_agg(jsonb_build_object(
                    'day_of_week', e.day_of_week,
                    'start_time', to_char(e.start_time, 'HH24:MI'),
                    'end_time', to_char(e.end_time, 'HH24:MI'),
                    'subject', s.name,
                    'section', sc.name,
                    'grade_level', sc.grade_level,
                    'strand', coalesce(l.strand_only, sc.strands),
                    'room', rm.name,
                    'is_fixed', e.is_fixed)
                order by e.day_of_week, e.start_time, s.name)
            from public.schedule_entries e
            join public.teacher_loads l on l.id = e.teacher_load_id
            join public.subjects s on s.id = l.subject_id
            join public.sections sc on sc.id = l.section_id
            left join public.rooms rm on rm.id = e.room_id
            where e.run_id = run.id and e.teacher_id = teacher.id), '[]'::jsonb));
end;
$$;

revoke all on function public.get_teacher_schedule() from public, anon, authenticated;
grant execute on function public.get_teacher_schedule() to authenticated;
-- Teacher Schedule END

commit;
