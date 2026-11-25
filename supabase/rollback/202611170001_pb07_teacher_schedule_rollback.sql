-- Author: Gian Mandac
-- Created Date: 20261117
-- UNDO for migrations/202611170001_pb07_teacher_schedule.sql.
-- Removes only the Teacher schedule function. The rooms table and the
-- schedule_entries.room_id / is_fixed columns already existed in the live project,
-- so they are deliberately left in place. The Teacher dashboard's schedule panel
-- shows "could not be loaded" until the migration is applied again.

begin;
drop function if exists public.get_teacher_schedule();
commit;
