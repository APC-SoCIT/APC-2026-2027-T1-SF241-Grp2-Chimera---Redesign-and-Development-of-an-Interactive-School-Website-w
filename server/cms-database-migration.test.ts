/*
 * Author: Gian Mandac
 * Created Date: 20261126
 * PB-01: the content workspace saves to cms_content and resources through role-checked
 * functions, and visitors only see published items.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("CMS database migration", () => {
  let db: PGlite;
  const admin = "00000000-0000-4000-8000-0000000000a1";
  const registrar = "00000000-0000-4000-8000-0000000000b2";
  const inactiveAdmin = "00000000-0000-4000-8000-0000000000c3";

  function asUser<T>(userId: string, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ session_id: userId })]);
      return tx.query<T>(sql, params);
    });
  }
  const asVisitor = <T>(sql: string) => db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return tx.query<T>(sql);
  });
  const saveContent = async (args: unknown[], userId = admin) =>
    (await asUser<{ id: number }>(userId, "select public.cms_save_content($1, $2, $3, $4, $5, $6, $7, $8::jsonb) as id", args)).rows[0].id;

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
      -- Just enough of Supabase Storage for the bucket and file rules.
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      insert into storage.buckets (id, name, public) values ('resource-files', 'resource-files', true);
    `);
    const schema = readFileSync(new URL("../supabase/reference/SNCS_Schema_Final.sql", import.meta.url), "utf8");
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE users ("), schema.indexOf("-- 3. ENROLLMENT")));
    for (const migration of [
      "202610020001_pb11_public_resources.sql",
      "202611130001_sc13_admin_auth.sql", "202611140001_sc20_staff_portal_role.sql",
      "202611140002_sc18_manage_staff_accounts.sql", "202611140003_sc21_registrar_application_access.sql",
      "202611140004_sc19_sc30_staff_access.sql", "202611260001_pb01_cms_database.sql",
    ]) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    const ids = [admin, registrar, inactiveAdmin];
    await db.query("insert into auth.users (id) select unnest($1::uuid[])", [ids]);
    await db.exec("insert into auth.sessions (id, user_id) select id, id from auth.users");
    await db.query(`
      insert into public.users (email, password_hash, full_name, role, account_status, auth_user_id, must_change_password) values
        ('admin@example.com', '', 'Ana Reyes', 'admin', 'active', $1, false),
        ('r@example.com', '', 'Registrar', 'registrar', 'active', $2, false),
        ('old@example.com', '', 'Former Admin', 'admin', 'inactive', $3, false)`, ids);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("keeps drafts private, then shows a published announcement to visitors", async () => {
    const id = await saveContent([null, "announcement", "Enrollment opens", "enrollment-opens", "Enrollment opens soon.", "Enrollment opens soon.", null, "[]"]);
    expect((await asVisitor("select * from public.cms_public_content()")).rows).toEqual([]);
    await asUser(admin, "select public.cms_set_status('content', $1, 'published')", [id]);
    const visible = await asVisitor<{ title: string; publishedAt: string | null }>('select title, "publishedAt" from public.cms_public_content()');
    expect(visible.rows).toEqual([expect.objectContaining({ title: "Enrollment opens", publishedAt: expect.anything() })]);

    const listed = await asUser<{ title: string; createdByName: string }>(admin, 'select title, "createdByName" from public.cms_list_content()');
    expect(listed.rows).toEqual([{ title: "Enrollment opens", createdByName: "Ana Reyes" }]);
    const audit = await db.query<{ action: string }>("select action from public.audit_logs where entity_type = 'cms_content' order by id");
    expect(audit.rows.map((row) => row.action)).toEqual(["cms.create", "cms.status"]);
  });

  it("hides items in Trash and only deletes them permanently from Trash", async () => {
    const id = await saveContent([null, "event", "Family Day", "family-day", "", "Family Day.", "2026-12-12T00:00:00+08:00", "[]"]);
    await asUser(admin, "select public.cms_set_status('content', $1, 'published')", [id]);
    await expect(asUser(admin, "select public.cms_delete('content', $1)", [id])).rejects.toThrow(/not in Trash/);
    await asUser(admin, "select public.cms_trash('content', $1, false)", [id]);
    const titles = await asVisitor<{ title: string }>("select title from public.cms_public_content()");
    expect(titles.rows.map((row) => row.title)).not.toContain("Family Day");
    await asUser(admin, "select public.cms_delete('content', $1)", [id]);
    expect((await db.query("select 1 from public.cms_content where id = $1", [id])).rows).toEqual([]);
  });

  it("refuses an event without a date and a page identifier with spaces", async () => {
    await expect(saveContent([null, "event", "No date", "no-date", "", "", null, "[]"])).rejects.toThrow(/event date/);
    await expect(saveContent([null, "page", "Bad", "Bad Slug", "", "", null, "[]"])).rejects.toThrow(/Page identifier/);
  });

  it("saves a PDF resource that visitors see only when published, public and not in Trash", async () => {
    const save = await asUser<{ id: number }>(admin,
      "select public.cms_save_resource(null, 'Enrollment form', 'Admission Forms', 'uploads/enrollment-form.pdf', 2048, 'public') as id");
    const id = save.rows[0].id;
    const visitorTitles = async () => (await asVisitor<{ title: string }>("select title from public.resources")).rows.map((row) => row.title);
    expect(await visitorTitles()).not.toContain("Enrollment form");
    await asUser(admin, "select public.cms_set_status('resource', $1, 'published')", [id]);
    expect(await visitorTitles()).toContain("Enrollment form");
    await asUser(admin, "select public.cms_trash('resource', $1, false)", [id]);
    expect(await visitorTitles()).not.toContain("Enrollment form");
    await asUser(admin, "select public.cms_trash('resource', $1, true)", [id]);
    await asUser(admin, "select public.cms_trash('resource', $1, false)", [id]);
    expect((await asUser<{ path: string }>(admin, "select public.cms_delete('resource', $1) as path", [id])).rows[0].path)
      .toBe("uploads/enrollment-form.pdf");
  });

  it.each([registrar, inactiveAdmin, ""])("refuses content changes from anyone but an active Admin", async (userId) => {
    await expect(saveContent([null, "page", "Not allowed", "not-allowed", "", "", null, "[]"], userId)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(userId, "select * from public.cms_list_content()")).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps the content table closed to direct reads and writes from the site", async () => {
    await expect(asVisitor("select * from public.cms_content")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(admin, "insert into public.cms_content (content_type, title, slug, body, created_by) values ('page', 'x', 'x', '', 1)"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("creates the public content-images bucket", async () => {
    const buckets = await db.query<{ id: string; public: boolean }>("select id, public from storage.buckets order by id");
    expect(buckets.rows).toEqual([{ id: "content-images", public: true }, { id: "resource-files", public: true }]);
  });
});
