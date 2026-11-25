/*
 * Author: Gian Mandac
 * Created Date: 20261126
 * PB-01: Admins edit the school's contact details through role-checked functions, the database
 * enforces the same rules as the form, and the website's original news and events become
 * editable published items.
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultContactDetails } from "../src/lib/content/contact";

describe("site contact details migration", () => {
  let db: PGlite;
  const admin = "00000000-0000-4000-8000-0000000000a1";
  const registrar = "00000000-0000-4000-8000-0000000000b2";
  const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

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
  const current = async () => (await asUser<{ content: typeof defaultContactDetails; updatedAt: string; updatedByName: string | null }>(
    admin, "select * from public.cms_get_site_content('contact')")).rows[0];
  const save = (content: unknown, expected: string | null, userId = admin) =>
    asUser<{ saved: string }>(userId, "select public.cms_save_site_content('contact', $1::jsonb, $2::timestamptz) as saved",
      [JSON.stringify(content), expected]);

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
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      insert into storage.buckets (id, name, public) values ('resource-files', 'resource-files', true);
    `);
    const schema = readFileSync(new URL("../supabase/reference/SNCS_Schema_Final.sql", import.meta.url), "utf8");
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE users ("), schema.indexOf("-- 3. ENROLLMENT")));
    await db.exec(schema.slice(schema.indexOf("CREATE TABLE enrollment_periods ("), schema.indexOf("-- 4. SCHEDULING")));
    for (const name of [
      "202610020001_pb11_public_resources.sql",
      "202611130001_sc13_admin_auth.sql", "202611140001_sc20_staff_portal_role.sql",
      "202611140002_sc18_manage_staff_accounts.sql", "202611140003_sc21_registrar_application_access.sql",
      "202611140004_sc19_sc30_staff_access.sql", "202611260001_pb01_cms_database.sql",
    ]) await db.exec(migration(name));
    const ids = [admin, registrar];
    await db.query("insert into auth.users (id) select unnest($1::uuid[])", [ids]);
    await db.exec("insert into auth.sessions (id, user_id) select id, id from auth.users");
    await db.query(`
      insert into public.users (email, password_hash, full_name, role, account_status, auth_user_id, must_change_password) values
        ('admin@example.com', '', 'Ana Reyes', 'admin', 'active', $1, false),
        ('r@example.com', '', 'Registrar', 'registrar', 'active', $2, false)`, ids);
    // An Admin already posted an item with one of the original identifiers; the copy must not replace it.
    const own = await asUser<{ id: number }>(admin, "select public.cms_save_content(null, 'event', 'Family lunch', 'kainang-pamilya', '', 'Our own post.', '2026-09-28T00:00:00+08:00', '[]') as id");
    await asUser(admin, "select public.cms_set_status('content', $1, 'published')", [own.rows[0].id]);
    await db.exec(migration("202611260002_pb01_site_contact_details.sql"));
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("starts with the contact details the website shows today", async () => {
    const row = await current();
    expect(row.content).toEqual(defaultContactDetails);
    expect(row.updatedByName).toBeNull();
    const visible = await asVisitor<{ key: string; content: unknown }>("select * from public.cms_public_site_content()");
    expect(visible.rows).toEqual([{ key: "contact", content: defaultContactDetails }]);
  });

  it("saves an Admin's change, records who made it, and writes the audit log", async () => {
    const before = await current();
    const next = { ...defaultContactDetails, officeHours: "Monday to Saturday, 7:30 AM–4:30 PM" };
    await save(next, before.updatedAt);
    const after = await current();
    expect(after.content.officeHours).toBe("Monday to Saturday, 7:30 AM–4:30 PM");
    expect(after.updatedByName).toBe("Ana Reyes");
    const audit = await db.query<{ action: string; entity_type: string }>("select action, entity_type from public.audit_logs where entity_type = 'site_content'");
    expect(audit.rows).toEqual([{ action: "cms.site_content", entity_type: "site_content" }]);
  });

  it("refuses a save made from an older copy, so one Admin cannot overwrite another", async () => {
    const before = await current();
    await save({ ...defaultContactDetails, address: "First change" }, before.updatedAt);
    await expect(save({ ...defaultContactDetails, address: "Second change" }, before.updatedAt)).rejects.toThrow(/Another Admin changed/);
    expect((await current()).content.address).toBe("First change");
  });

  it.each([
    [{ ...defaultContactDetails, address: "" }, /school address/],
    [{ ...defaultContactDetails, mainPhone: "call us" }, /main phone/],
    [{ ...defaultContactDetails, admissionsEmail: undefined }, /admissions email/],
    [{ ...defaultContactDetails, offices: [] }, /between 1 and 12 offices/],
    [{ ...defaultContactDetails, offices: [{ ...defaultContactDetails.offices[0], channels: [{ kind: "link", value: "http://x.com", label: "X" }] }] }, /https/],
    [{ ...defaultContactDetails, offices: [defaultContactDetails.offices[0], defaultContactDetails.offices[0]] }, /same name/],
    [{ ...defaultContactDetails, offices: [{ ...defaultContactDetails.offices[0], channels: [{ kind: "fax", value: "1" }] }] }, /unknown contact type/],
  ])("refuses details that break the rules (%#)", async (content, message) => {
    await expect(save(content, (await current()).updatedAt)).rejects.toThrow(message);
  });

  it("refuses contact changes from anyone but an active Admin, and keeps the table closed", async () => {
    await expect(save(defaultContactDetails, null, registrar)).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(registrar, "select * from public.cms_get_site_content('contact')")).rejects.toMatchObject({ code: "42501" });
    await expect(asVisitor("select * from public.site_content")).rejects.toMatchObject({ code: "42501" });
    await expect(asUser(admin, "update public.site_content set content = '{}'")).rejects.toMatchObject({ code: "42501" });
  });

  it("publishes the original news and events as editable items without an author", async () => {
    const visible = await asVisitor<{ slug: string; contentType: string; title: string }>(
      'select slug, "contentType", title from public.cms_public_content() order by slug');
    expect(visible.rows.filter((row) => row.contentType === "announcement").map((row) => row.slug).sort())
      .toEqual(["genyo-learning-platform-2026-2027", "office-transactions"]);
    expect(visible.rows.filter((row) => row.contentType === "event")).toHaveLength(7);
    // The Admin's earlier post keeps its identifier; the original copy was skipped.
    expect(visible.rows.filter((row) => row.slug === "kainang-pamilya")).toEqual([
      { slug: "kainang-pamilya", contentType: "event", title: "Family lunch" },
    ]);
    const listed = await asUser<{ slug: string; createdByName: string | null }>(admin,
      `select slug, "createdByName" from public.cms_list_content() where slug = 'office-transactions'`);
    expect(listed.rows).toEqual([{ slug: "office-transactions", createdByName: null }]);
  });

  it("lets an Admin edit an original post, recording them as its last editor", async () => {
    const id = (await db.query<{ id: number }>("select id from public.cms_content where slug = 'office-transactions'")).rows[0].id;
    await asUser(admin, "select public.cms_save_content($1, 'announcement', 'Office hours update', 'office-transactions', '', 'Open on Saturdays too.', null, '[]')", [id]);
    const listed = await asUser<{ title: string; updatedByName: string; status: string }>(admin,
      `select title, "updatedByName", status from public.cms_list_content() where slug = 'office-transactions'`);
    expect(listed.rows).toEqual([{ title: "Office hours update", updatedByName: "Ana Reyes", status: "published" }]);
  });
});
