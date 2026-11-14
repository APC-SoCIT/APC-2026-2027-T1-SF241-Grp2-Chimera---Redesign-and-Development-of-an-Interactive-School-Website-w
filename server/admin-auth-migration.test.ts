/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validApplication } from "../src/lib/enrollment/fixtures";
import { saveEnrollment } from "./enrollment-transaction";

describe("staff authorization migrations", () => {
  let db: PGlite;
  const adminId = "00000000-0000-4000-8000-000000000001";
  const teacherId = "00000000-0000-4000-8000-000000000002";
  const inactiveId = "00000000-0000-4000-8000-000000000003";
  const unlinkedId = "00000000-0000-4000-8000-000000000004";
  const resetId = "00000000-0000-4000-8000-000000000005";
  const registrarId = "00000000-0000-4000-8000-000000000006";
  const managerId = "00000000-0000-4000-8000-000000000007";
  let reference: string;

  function asUser<T>(userId: string, sql: string, values: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      return tx.query<T>(sql, values);
    });
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    const schema = readFileSync(new URL("../supabase/reference/SNCS_Schema_Final.sql", import.meta.url), "utf8");
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE users ("), schema.indexOf("CREATE TABLE sessions (")));
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE enrollment_periods ("), schema.indexOf("-- 4. SCHEDULING")));
    await db.exec("grant select, insert, update, delete on public.users to anon, authenticated");
    await db.exec("grant select on public.enrollment_applications to anon, authenticated");
    for (const migration of [
      "202611130001_sc13_admin_auth.sql", "202611140001_sc20_staff_portal_role.sql",
      "202611140002_sc18_manage_staff_accounts.sql", "202611140003_sc21_registrar_application_access.sql",
    ]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.query("insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5), ($6), ($7)", [
      adminId, teacherId, inactiveId, unlinkedId, resetId, registrarId, managerId,
    ]);
    await db.query(`
      insert into public.users (email, full_name, role, account_status, auth_user_id, must_change_password) values
        ('admin@example.com', 'Admin', 'admin', 'active', $1, false),
        ('teacher@example.com', 'Teacher', 'teacher', 'active', $2, false),
        ('inactive@example.com', 'Inactive', 'admin', 'inactive', $3, false),
        ('reset@example.com', 'Reset', 'registrar', 'active', $4, true),
        ('registrar@example.com', 'Registrar', 'registrar', 'active', $5, false),
        ('manager@example.com', 'Manager', 'admin', 'active', $6, false)
    `, [adminId, teacherId, inactiveId, resetId, registrarId, managerId]);
    await db.query("update public.users set manage_staff_accounts = true where auth_user_id = $1", [managerId]);
    await db.exec("insert into public.enrollment_periods (school_year, status) values ('2026-2027', 'open')");
    const receipt = await saveEnrollment({ query: (sql, values) => db.query(sql, values) }, {
      submissionId: "00000000-0000-4000-8000-000000000008", periodId: "1", ipHash: "test-ip", data: validApplication,
    });
    reference = receipt.reference;
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it.each([
    ["active admin", adminId, "admin"],
    ["active Registrar", registrarId, "registrar"],
    ["teacher", teacherId, null],
    ["inactive admin", inactiveId, null],
    ["unlinked Auth user", unlinkedId, null],
    ["Registrar who must reset their password", resetId, null],
    ["missing Auth subject", "", null],
  ])("checks the current role and status for %s", async (_name, userId, role) => {
    const result = await asUser(userId, "select public.get_staff_portal_role() as role, public.has_active_admin_access() as legacy_admin");
    expect(result.rows).toEqual([{ role, legacy_admin: role === "admin" }]);
  });

  it("blocks anonymous access to the RPC and prevents browser role escalation", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select public.get_staff_portal_role()");
    })).rejects.toMatchObject({ code: "42501" });
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("update public.users set role = 'admin' where auth_user_id = $1", [teacherId]);
    })).rejects.toMatchObject({ code: "42501" });
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select password_hash from public.users");
    })).rejects.toMatchObject({ code: "42501" });
  });

  it("returns an application saved through PB-12 to an active Registrar", async () => {
    const result = await asUser(registrarId, "select * from public.list_registrar_applications()");
    expect(result.rows).toEqual([{ reference_no: reference, status: "pending", submitted_at: expect.any(Date) }]);
  });

  it.each([adminId, teacherId, unlinkedId, resetId, ""])("denies enrollment RPC access to a non-Registrar session", async (userId) => {
    await expect(asUser(userId, "select * from public.list_registrar_applications()")).rejects.toMatchObject({ code: "42501" });
  });

  it("blocks public access through both the RPC and the enrollment table", async () => {
    for (const sql of ["select * from public.list_registrar_applications()", "select * from public.enrollment_applications"]) {
      await expect(db.transaction(async (tx) => {
        await tx.exec("set local role anon");
        await tx.query(sql);
      })).rejects.toMatchObject({ code: "42501" });
    }
    await expect(asUser(registrarId, "select * from public.enrollment_applications")).rejects.toMatchObject({ code: "42501" });
  });

  it("links accounts provisioned by an authorized manager and rolls back a failed Auth transaction", async () => {
    const newId = "00000000-0000-4000-8000-000000000009";
    const provision = (actor: string, email: string, authId: string) => db.transaction(async (tx) => {
      await tx.query("insert into auth.users (id, email) values ($1, $2)", [authId, email]);
      await tx.query("update auth.users set raw_app_meta_data = $1 where id = $2", [
        { chimera_staff_provisioning: { created_by: actor, full_name: "New staff", role: "registrar" } }, authId,
      ]);
    });
    await expect(provision(adminId, "new@example.com", newId)).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select id from auth.users where id = $1", [newId])).rows).toEqual([]);
    await expect(provision(managerId, "registrar@example.com", newId)).rejects.toMatchObject({ code: "23505" });
    expect((await db.query("select id from auth.users where id = $1", [newId])).rows).toEqual([]);
    await provision(managerId, "NEW@example.com", newId);
    expect((await db.query("select email, role, password_hash, manage_staff_accounts from public.users where auth_user_id = $1", [newId])).rows)
      .toEqual([{ email: "new@example.com", role: "registrar", password_hash: null, manage_staff_accounts: false }]);
  });

  it("lists and assigns roles only for authorized account managers", async () => {
    const { rows: [account] } = await db.query<{ id: string }>("select id::text from public.users where auth_user_id = $1", [teacherId]);
    for (const userId of [adminId, registrarId, teacherId]) {
      await expect(asUser(userId, "select * from public.list_staff_accounts()")).rejects.toMatchObject({ code: "42501" });
      await expect(asUser(userId, "select public.assign_staff_role($1, 'registrar')", [account.id])).rejects.toMatchObject({ code: "42501" });
    }
    const list = await asUser(managerId, "select * from public.list_staff_accounts()");
    expect(list.rows).toContainEqual({ id: account.id, email: "teacher@example.com", full_name: "Teacher", role: "teacher", account_status: "active" });
    await asUser(managerId, "select public.assign_staff_role($1, 'registrar')", [account.id]);
    expect((await asUser(teacherId, "select public.get_staff_portal_role() as role")).rows).toEqual([{ role: "registrar" }]);
    await asUser(managerId, "select public.assign_staff_role($1, 'teacher')", [account.id]);
    await expect(asUser(teacherId, "select * from public.list_registrar_applications()")).rejects.toMatchObject({ code: "42501" });
  });
});
