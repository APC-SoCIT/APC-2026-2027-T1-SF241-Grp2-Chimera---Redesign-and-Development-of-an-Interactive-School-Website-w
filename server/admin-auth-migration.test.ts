/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("staff authorization migrations", () => {
  let db: PGlite;
  const adminId = "00000000-0000-4000-8000-000000000001";
  const teacherId = "00000000-0000-4000-8000-000000000002";
  const inactiveId = "00000000-0000-4000-8000-000000000003";
  const unlinkedId = "00000000-0000-4000-8000-000000000004";
  const resetId = "00000000-0000-4000-8000-000000000005";
  const registrarId = "00000000-0000-4000-8000-000000000006";

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    `);
    const schema = readFileSync(new URL("../supabase/reference/SNCS_Schema_Final.sql", import.meta.url), "utf8");
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE users ("), schema.indexOf("CREATE TABLE sessions (")));
    await db.exec("grant select, insert, update, delete on public.users to anon, authenticated");
    for (const migration of ["202611130001_sc13_admin_auth.sql", "202611140001_sc20_staff_portal_role.sql"]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await db.query("insert into auth.users values ($1), ($2), ($3), ($4), ($5), ($6)", [
      adminId, teacherId, inactiveId, unlinkedId, resetId, registrarId,
    ]);
    await db.query(`
      insert into public.users (email, full_name, role, account_status, auth_user_id, must_change_password) values
        ('admin@example.com', 'Admin', 'admin', 'active', $1, false),
        ('teacher@example.com', 'Teacher', 'teacher', 'active', $2, false),
        ('inactive@example.com', 'Inactive', 'admin', 'inactive', $3, false),
        ('reset@example.com', 'Reset', 'registrar', 'active', $4, true),
        ('registrar@example.com', 'Registrar', 'registrar', 'active', $5, false)
    `, [adminId, teacherId, inactiveId, resetId, registrarId]);
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
    await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const result = await tx.query("select public.get_staff_portal_role() as role, public.has_active_admin_access() as legacy_admin");
      expect(result.rows).toEqual([{ role, legacy_admin: role === "admin" }]);
    });
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
});
