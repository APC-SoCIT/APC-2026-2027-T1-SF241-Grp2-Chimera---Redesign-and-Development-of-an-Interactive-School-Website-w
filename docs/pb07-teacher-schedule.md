# PB-07: View Class Schedule (Teacher)

| | |
|---|---|
| **Backlog item** | PB-07 · Sprint 3 · 5 points · Owner: Gian Mandac |
| **User story** | US-07: *As a Teacher, I want to view my published class schedule so that I can prepare for my assigned lessons.* |
| **Use case** | View Class Schedule (included in Manage Schedule) |
| **Route** | `/teacher` (Teacher dashboard) |
| **Status** | Built. Shows real data once PB-02 publishes a schedule run |

## What the Teacher sees

- **My class schedule**: school year, term and publication date of the published run.
- A **weekly view** (Monday–Friday, plus Saturday only when there are Saturday classes), with
  **today highlighted** (Asia/Manila time).
- Each class shows **time, subject, section (and strand), and room**. A class without a room
  shows *Room to be assigned*. Classes fixed by the school (`is_fixed`) are labelled
  **Fixed lab class**.
- A **Show** filter: *Whole week* or a single day.
- Totals: classes per week and teaching hours.
- Clear notices instead of an empty page:
  - *No active classes found*: nothing has been published yet.
  - *Your account is not linked to a teacher record yet*: the login has no `teachers.user_id` link.
  - *Access denied*: the session is not an active Teacher.
- **View-only**: there are no edit buttons, and the database function only reads.

## Acceptance criteria (US-07)

| Criterion | Status | How |
|---|---|---|
| Backend identifies the teacher linked to the logged-in account | ✅ | `teachers.user_id` → `users.auth_user_id = auth.uid()` |
| Returns only that teacher's **published** meetings | ✅ | `schedule_runs.status = 'published'` and `schedule_entries.teacher_id` |
| Each meeting shows subject, section, day and start/end time | ✅ | Joined from `teacher_loads`, `subjects`, `sections` |
| Shows the room | ✅ | `schedule_entries.room_id` → `rooms.name` (see *Schema notes*) |
| Lab subjects show their assigned lab | 🟡 | Shows the room assigned to the meeting and labels fixed lab classes. There is no `subjects.special_room` column in the live database |
| Draft schedules are hidden | ✅ | Draft, failed and superseded runs are never returned |
| Clear notice when no published schedule exists | ✅ | *No active classes found* |
| Viewing is read-only | ✅ | No mutation endpoints; tables are not readable from the browser |
| Requests for another teacher's timetable are rejected | ✅ | The function takes no teacher parameter; it always uses the caller's own link |
| Teachers without an active `manage_schedule` grant cannot run scheduling actions | ✅ | No scheduling actions exist for Teachers. Delegation grants are not built yet (see PB-05) |

## How it works

```
Teacher dashboard (/teacher)
  └─ TeacherSchedulePanel.vue
       └─ getTeacherSchedule()  (src/lib/schedule/teacher-schedule.ts)
            └─ rpc get_teacher_schedule()   ← SECURITY DEFINER, Teacher-only
                 ├─ get_staff_portal_role() = 'teacher'  (active account, live session)
                 ├─ teachers.user_id ↔ users.auth_user_id = auth.uid()
                 ├─ published schedule_runs row (active term first)
                 └─ that teacher's schedule_entries + subject, section, room
```

The function returns:

```json
{
  "linked": true,
  "teacher_name": "Juan Dela Cruz",
  "run": { "school_year": "2026-2027", "term": "Term 2", "published_at": "…" },
  "entries": [
    { "day_of_week": 1, "start_time": "08:00", "end_time": "09:00",
      "subject": "Filipino 7", "section": "G7 - Our Lady of Guadalupe", "grade_level": 7,
      "strand": null, "room": "Room 201", "is_fixed": false }
  ]
}
```

When more than one run is published (one per term), the **active term** (`terms.is_active`)
wins; otherwise the most recently published run is shown.

## Files

| File | Purpose |
|---|---|
| `supabase/migrations/202611170001_pb07_teacher_schedule.sql` | `get_teacher_schedule()`; records the live `rooms`, `room_id` and `is_fixed` columns |
| `supabase/rollback/202611170001_pb07_teacher_schedule_rollback.sql` | Removes the function (leaves tables untouched) |
| `src/lib/schedule/teacher-schedule.ts` | Data access, time formatting, grouping by day |
| `src/components/TeacherSchedulePanel.vue` | The Teacher's schedule screen |
| `src/views/StaffDashboardView.vue` | Shows the panel for the `teacher` role |
| `server/teacher-schedule-migration.test.ts` | Database tests (own entries only, drafts hidden, unlinked teacher, role checks, no direct table access) |
| `src/components/TeacherSchedulePanel.test.ts` | Screen and helper tests |

## Deploying

1. Apply `supabase/migrations/202611170001_pb07_teacher_schedule.sql` to the Supabase project.
   It only **adds** a function. The `rooms` table and the two `schedule_entries` columns already
   exist in the live project, so those statements do nothing there.
2. Redeploy the site (merging to `main` deploys automatically).

No environment variables are needed.

## Testing it with real data

The schedule stays empty until PB-02 (upload loads → generate → publish) exists. To demo PB-07
before that, an administrator can insert a small published run in the Supabase Table Editor:

1. `terms`: one row with `is_active = true`.
2. `teachers`: a row whose `user_id` is the Teacher's `users.id`.
3. `sections`, `subjects`, `rooms`, and `teacher_loads` for that teacher.
4. `schedule_runs`: one row with `status = 'published'` and `published_at = now()`.
5. `schedule_entries`: a few meetings for that run and teacher.

Then sign in as that Teacher at `/login`.

## Schema notes (live database vs documents)

- The live database has **`rooms`**, **`schedule_entries.room_id`** and **`schedule_entries.is_fixed`**.
  `SNCS_Schema_Final.sql` does not show them; this migration records them.
- The backlog and US-07 mention **`sections.room_name` / `room_number`** and **`subjects.special_room`**.
  Neither exists in the live database. The room comes from `schedule_entries.room_id`.
- **Delegated scheduling (`manage_schedule` grants)** and the **Academic Coordinator** role are not in
  the database yet, so only regular Teacher access is implemented.

## Depends on

- **PB-02** (Jan, Sprint 3): generating and publishing schedule runs.
- **PB-06** (Teacher login): done; the Teacher dashboard and route guard already exist.
