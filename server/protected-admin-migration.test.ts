/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261126
 */
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("SC-56 protected top-level Admin", () => {
  let db: PGlite;
  const owner = "00000000-0000-4000-8000-000000000001";
  const manager = "00000000-0000-4000-8000-000000000002";
  const teacher = "00000000-0000-4000-8000-000000000003";
  const ordinaryAdmin = "00000000-0000-4000-8000-000000000004";

  async function asUser<T = Record<string, unknown>>(user: string, sql: string, values: unknown[] = []) {
    return db.transaction(async tx => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ session_id: user })]);
      return tx.query<T>(sql, values);
    });
  }

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb,
        encrypted_password text default 'original', banned_until timestamptz);
      create table auth.sessions (id uuid primary key, user_id uuid references auth.users(id));
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    `);
    const schema = readFileSync(new URL("../supabase/reference/SNCS_Schema_Final.sql", import.meta.url), "utf8");
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE users ("), schema.indexOf("-- 2. WEBSITE CONTENT")));
    for (const migration of [
      "202611130001_sc13_admin_auth.sql", "202611140001_sc20_staff_portal_role.sql",
      "202611140002_sc18_manage_staff_accounts.sql", "202611140004_sc19_sc30_staff_access.sql",
      "202611190001_academic_coordinator_access.sql",
    ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    for (const [id, name, role] of [
      [owner, "Owner", "admin"], [manager, "Manager", "admin"],
      [teacher, "Teacher", "teacher"], [ordinaryAdmin, "Ordinary Admin", "admin"],
    ]) {
      await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.com`]);
      await db.query(`insert into public.users (email, full_name, role, auth_user_id, manage_staff_accounts)
        values ($1, $2, $3, $4, $3 = 'admin')`, [`${name}@example.com`, name, role, id]);
      await db.query("insert into auth.sessions values ($1, $1)", [id]);
    }
    // Upgrade with existing accounts: no guessed owner and no destructive backfill.
    await db.exec(readFileSync(new URL("../supabase/migrations/202611260002_sc56_protected_admin.sql", import.meta.url), "utf8"));
    expect((await db.query("select id from public.users where is_protected_admin")).rows).toEqual([]);
    await db.query("update public.users set is_protected_admin = true where auth_user_id = $1", [owner]);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("keeps every migration version unique, including PB-01 and SC-56", () => {
    const files = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter(name => name.endsWith(".sql"));
    const versions = files.map(name => name.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);
    expect(files).toContain("202611260002_sc56_protected_admin.sql");
  });

  it("exposes designation only in authorized staff listings and rejects protected/self/unauthorized deactivation targets", async () => {
    const { rows } = await asUser(manager, "select * from public.list_staff_accounts()");
    expect(rows.find(row => row.full_name === "Owner")).toMatchObject({ is_protected_admin: true });
    expect(rows.find(row => row.full_name === "Ordinary Admin")).toMatchObject({ is_protected_admin: false });
    await expect(asUser(teacher, "select * from public.list_staff_accounts()")).rejects.toMatchObject({ code: "42501" });
    for (const [actor, staffId, expected] of [
      [manager, 1, null], [manager, 2, null], [teacher, 4, null], [manager, 4, ordinaryAdmin],
    ]) {
      const result = await db.query("select public.get_staff_deactivation_target($1, $2) as target", [actor, staffId]);
      expect(result.rows).toEqual([{ target: expected }]);
    }
    // The preflight is server-only, not a new browser authorization surface.
    await expect(asUser(manager, "select public.get_staff_deactivation_target($1, 4)", [manager]))
      .rejects.toMatchObject({ code: "42501" });
    const result = await db.transaction(async tx => {
      await tx.exec("set local role service_role");
      return tx.query("select public.get_staff_deactivation_target($1, 4) as target", [manager]);
    });
    expect(result.rows).toEqual([{ target: ordinaryAdmin }]);
    await db.query("update public.users set account_status = 'inactive' where auth_user_id = $1", [ordinaryAdmin]);
    expect((await db.query("select public.get_staff_deactivation_target($1, 4) as target", [manager])).rows)
      .toEqual([{ target: null }]);
    await db.query("update public.users set account_status = 'active' where auth_user_id = $1", [ordinaryAdmin]);
  });

  it("rolls back password, ban, sessions, metadata and audit when an old API bypasses the new preflight", async () => {
    await expect(db.transaction(async tx => {
      await tx.query("update auth.users set encrypted_password = 'changed', banned_until = now() + interval '1 day' where id = $1", [owner]);
      await tx.query("delete from auth.sessions where user_id = $1", [owner]);
      await tx.query("update auth.users set raw_app_meta_data = $1 where id = $2", [{ chimera_staff_action: {
        action: "deactivate", staff_id: "1", actor_id: manager, request_id: "blocked-deactivation",
      } }, owner]);
    })).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select encrypted_password, banned_until, raw_app_meta_data from auth.users where id = $1", [owner])).rows)
      .toEqual([{ encrypted_password: "original", banned_until: null, raw_app_meta_data: null }]);
    expect((await db.query("select id from auth.sessions where user_id = $1", [owner])).rows).toHaveLength(1);
    expect((await asUser(owner, "select public.get_staff_portal_role() as role")).rows).toEqual([{ role: "admin" }]);
    expect((await db.query("select id from public.audit_logs where entity_id = 1")).rows).toEqual([]);
  });

  it("blocks demotion, management-permission removal, deletion and browser removal of designation", async () => {
    await expect(asUser(manager, "select public.assign_staff_role(1, 'teacher')")).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("update public.users set manage_staff_accounts = false where id = 1")).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("delete from public.users where id = 1")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(manager, "update public.users set is_protected_admin = false where id = 1"))
      .rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("update public.users set is_protected_admin = true where id = 3"))
      .rejects.toMatchObject({ code: "23514" });
  });

  it("still deactivates ordinary Admins and records the correct audit and status", async () => {
    await db.query("update auth.users set raw_app_meta_data = $1 where id = $2", [{ chimera_staff_action: {
      action: "deactivate", staff_id: "4", actor_id: manager, request_id: "allowed-deactivation",
    } }, ordinaryAdmin]);
    expect((await db.query("select account_status, is_protected_admin from public.users where id = 4")).rows)
      .toEqual([{ account_status: "inactive", is_protected_admin: false }]);
    expect((await db.query("select actor_user_id::text, action, old_value, new_value from public.audit_logs where entity_id = 4")).rows)
      .toEqual([{ actor_user_id: "2", action: "account.deactivate", old_value: { account_status: "active" }, new_value: { account_status: "inactive" } }]);
  });

  it("rejects protected Admin resets through preflight and the legacy Auth metadata trigger", async () => {
    expect((await db.query("select public.get_staff_auth_target($1, 1) as target", [manager])).rows).toEqual([{ target: null }]);
    await expect(db.transaction(async tx => {
      await tx.query("update auth.users set encrypted_password = 'changed' where id = $1", [owner]);
      await tx.query("delete from auth.sessions where user_id = $1", [owner]);
      await tx.query("update auth.users set raw_app_meta_data = $1 where id = $2", [{ chimera_staff_action: {
        action: "reset-password", staff_id: "1", actor_id: manager, request_id: "blocked-reset",
      } }, owner]);
    })).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select account_status, must_change_password, is_protected_admin from public.users where id = 1")).rows)
      .toEqual([{ account_status: "active", must_change_password: false, is_protected_admin: true }]);
    expect((await db.query("select encrypted_password, raw_app_meta_data from auth.users where id = $1", [owner])).rows)
      .toEqual([{ encrypted_password: "original", raw_app_meta_data: null }]);
    expect((await db.query("select id from auth.sessions where user_id = $1", [owner])).rows).toHaveLength(1);
    expect((await db.query("select id from public.audit_logs where entity_id = 1")).rows).toEqual([]);
  });

  it("still resets ordinary staff and audits the password-reset requirement", async () => {
    expect((await db.query("select public.get_staff_auth_target($1, 3) as target", [manager])).rows).toEqual([{ target: teacher }]);
    await db.query("update auth.users set raw_app_meta_data = $1 where id = $2", [{ chimera_staff_action: {
      action: "reset-password", staff_id: "3", actor_id: manager, request_id: "ordinary-reset",
    } }, teacher]);
    expect((await db.query("select must_change_password from public.users where id = 3")).rows)
      .toEqual([{ must_change_password: true }]);
    expect((await db.query("select action from public.audit_logs where entity_id = 3")).rows)
      .toEqual([{ action: "account.password_reset" }]);
  });
});
