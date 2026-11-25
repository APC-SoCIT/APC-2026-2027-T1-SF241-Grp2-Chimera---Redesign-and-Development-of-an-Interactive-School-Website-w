/*
 * Author: Gian Mandac
 * Created Date: 20261117
 * PB-07 / US-07: a Teacher sees only their own published class meetings.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("teacher schedule migration", () => {
  let db: PGlite;
  const teacherA = "00000000-0000-4000-8000-0000000000a1";
  const teacherB = "00000000-0000-4000-8000-0000000000b2";
  const unlinked = "00000000-0000-4000-8000-0000000000c3";
  const registrar = "00000000-0000-4000-8000-0000000000d4";
  const admin = "00000000-0000-4000-8000-0000000000e5";
  let publishedRun: number;

  function asUser<T>(userId: string, sql: string) {
    return db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ session_id: userId })]);
      return tx.query<T>(sql);
    });
  }
  const schedule = async (userId: string) =>
    (await asUser<{ s: Record<string, unknown> }>(userId, "select public.get_teacher_schedule() as s")).rows[0].s;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb, encrypted_password text);
      create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id));
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    `);
    const schema = readFileSync(new URL("../supabase/reference/SNCS_Schema_Final.sql", import.meta.url), "utf8");
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE users ("), schema.indexOf("-- 2. WEBSITE CONTENT")));
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE enrollment_periods ("), schema.indexOf("-- 4. SCHEDULING")));
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE terms ("), schema.indexOf("CREATE TABLE schedule_entries (")));
    // Same columns as the reference schema; the GiST overlap constraint is not needed for these tests.
    await db.exec(`
      CREATE TABLE schedule_entries (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        run_id BIGINT NOT NULL REFERENCES schedule_runs(id) ON DELETE CASCADE,
        teacher_load_id BIGINT NOT NULL REFERENCES teacher_loads(id) ON DELETE CASCADE,
        teacher_id BIGINT NOT NULL REFERENCES teachers(id),
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
        start_time TIME NOT NULL, end_time TIME NOT NULL CHECK (end_time > start_time));
    `);
    for (const migration of [
      "202611130001_sc13_admin_auth.sql", "202611140001_sc20_staff_portal_role.sql",
      "202611140002_sc18_manage_staff_accounts.sql", "202611140003_sc21_registrar_application_access.sql",
      "202611140004_sc19_sc30_staff_access.sql", "202611170001_pb07_teacher_schedule.sql",
    ]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }

    const ids = [teacherA, teacherB, unlinked, registrar, admin];
    await db.query(`insert into auth.users (id) select unnest($1::uuid[])`, [ids]);
    await db.exec("insert into auth.sessions (id, user_id) select id, id from auth.users");
    await db.query(`
      insert into public.users (email, full_name, role, account_status, auth_user_id, must_change_password) values
        ('a@example.com', 'Teacher A', 'teacher', 'active', $1, false),
        ('b@example.com', 'Teacher B', 'teacher', 'active', $2, false),
        ('c@example.com', 'Unlinked Teacher', 'teacher', 'active', $3, false),
        ('r@example.com', 'Registrar', 'registrar', 'active', $4, false),
        ('admin@example.com', 'Admin', 'admin', 'active', $5, false)`, ids);
    await db.exec(`
      insert into public.teachers (teacher_code, full_name, user_id)
        select 'T01', 'Teacher A', id from public.users where email = 'a@example.com'
        union all select 'T02', 'Teacher B', id from public.users where email = 'b@example.com';
      insert into public.terms (school_year, name, is_active) values ('2026-2027', 'Term 2', true);
      insert into public.sections (term_id, grade_level, name, strands, recess_group) values
        (1, 7, 'G7 - Our Lady of Guadalupe', null, '7-8'),
        (1, 11, 'G11 - St. Thomas', 'STEM', '11-12');
      insert into public.subjects (name, grade_level, subject_type) values
        ('Filipino 7', 7, 'core'), ('General Chemistry 1', 11, 'strand'), ('Math 7', 7, 'core');
      insert into public.teacher_loads (term_id, teacher_id, subject_id, section_id, meetings_60_per_week) values
        (1, 1, 1, 1, 4), (1, 1, 2, 2, 2), (1, 2, 3, 1, 4);
      insert into public.rooms (name) values ('Room 201'), ('Chemistry Lab');
      insert into public.schedule_runs (term_id, status, generated_by) values
        (1, 'superseded', 5), (1, 'draft', 5), (1, 'draft', 5);
      insert into public.schedule_entries (run_id, teacher_load_id, teacher_id, day_of_week, start_time, end_time, room_id, is_fixed) values
        (1, 1, 1, 1, '07:00', '08:00', 1, false),            -- superseded: hidden
        (2, 1, 1, 2, '07:00', '08:00', 1, false),            -- draft: hidden
        (3, 2, 1, 3, '10:00', '11:00', 2, true),             -- run 3, Teacher A (lab, fixed)
        (3, 1, 1, 1, '08:00', '09:00', 1, false),            -- run 3, Teacher A
        (3, 3, 2, 1, '09:00', '10:00', null, false);         -- run 3, Teacher B
    `);
    publishedRun = 3;
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("shows nothing while no schedule has been published", async () => {
    expect(await schedule(teacherA)).toEqual({ linked: true, teacher_name: "Teacher A", run: null, entries: [] });
  });

  it("returns only the signed-in Teacher's meetings from the published run, in day and time order", async () => {
    await db.query("update public.schedule_runs set status = 'published', published_at = now() where id = $1", [publishedRun]);
    const result = await schedule(teacherA);
    expect(result).toMatchObject({ linked: true, teacher_name: "Teacher A", run: { school_year: "2026-2027", term: "Term 2" } });
    expect(result.entries).toEqual([
      { day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "Filipino 7", section: "G7 - Our Lady of Guadalupe",
        grade_level: 7, strand: null, room: "Room 201", is_fixed: false },
      { day_of_week: 3, start_time: "10:00", end_time: "11:00", subject: "General Chemistry 1", section: "G11 - St. Thomas",
        grade_level: 11, strand: "STEM", room: "Chemistry Lab", is_fixed: true },
    ]);
    expect((await schedule(teacherB)).entries).toEqual([expect.objectContaining({ subject: "Math 7", room: null })]);
  });

  it("tells a Teacher whose account is not linked to a teacher record", async () => {
    expect(await schedule(unlinked)).toEqual({ linked: false, run: null, entries: [] });
  });

  it.each([registrar, admin, ""])("refuses non-Teacher sessions", async (userId) => {
    await expect(asUser(userId, "select public.get_teacher_schedule()")).rejects.toMatchObject({ code: "42501" });
  });

  it("blocks anonymous callers and direct table reads", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select public.get_teacher_schedule()");
    })).rejects.toMatchObject({ code: "42501" });
    for (const table of ["schedule_entries", "schedule_runs", "rooms", "teachers"]) {
      await expect(asUser(teacherA, `select * from public.${table}`)).rejects.toMatchObject({ code: "42501" });
    }
  });
});
