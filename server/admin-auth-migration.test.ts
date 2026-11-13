/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261113
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("SC-13 admin authorization migration", () => {
  let db: PGlite;
  const adminId = "00000000-0000-4000-8000-000000000001";
  const teacherId = "00000000-0000-4000-8000-000000000002";
  const inactiveId = "00000000-0000-4000-8000-000000000003";
  const unlinkedId = "00000000-0000-4000-8000-000000000004";
  const resetId = "00000000-0000-4000-8000-000000000005";

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
    const migration = readFileSync(new URL("../supabase/migrations/202611130001_sc13_admin_auth.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.query("insert into auth.users values ($1), ($2), ($3), ($4), ($5)", [
      adminId, teacherId, inactiveId, unlinkedId, resetId,
    ]);
    await db.query(`
      insert into public.users (email, full_name, role, account_status, auth_user_id, must_change_password) values
        ('admin@example.com', 'Admin', 'admin', 'active', $1, false),
        ('teacher@example.com', 'Teacher', 'teacher', 'active', $2, false),
        ('inactive@example.com', 'Inactive', 'admin', 'inactive', $3, false),
        ('reset@example.com', 'Reset', 'admin', 'active', $4, true)
    `, [adminId, teacherId, inactiveId, resetId]);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it.each([
    ["active admin", adminId, true],
    ["teacher", teacherId, false],
    ["inactive admin", inactiveId, false],
    ["unlinked Auth user", unlinkedId, false],
    ["admin who must reset their password", resetId, false],
    ["missing Auth subject", "", false],
  ])("checks the current role and status for %s", async (_name, userId, allowed) => {
    await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const result = await tx.query("select public.has_active_admin_access() as allowed");
      expect(result.rows).toEqual([{ allowed }]);
    });
  });

  it("blocks anonymous access to the RPC and prevents browser role escalation", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select public.has_active_admin_access()");
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
