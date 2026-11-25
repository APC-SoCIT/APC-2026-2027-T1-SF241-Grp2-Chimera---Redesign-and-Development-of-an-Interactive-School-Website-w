import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { applyItemState, cmsErrorMessage, contentItem, eventDay, eventStartsAt, removeItem } from "./database";
import { blankItem, type CmsItem } from "./preview";

function fakeClient(results: Record<string, unknown> = {}) {
  const calls: [string, Record<string, unknown> | undefined][] = [];
  const uploads: string[] = [];
  const removed: string[][] = [];
  const bucket = (name: string) => ({
    upload: vi.fn(async (path: string) => { uploads.push(`${name}/${path}`); return { error: null }; }),
    remove: vi.fn(async (paths: string[]) => { removed.push(paths); return { error: null }; }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/${name}/${path}` } }),
  });
  const client = {
    rpc: vi.fn(async (name: string, args?: Record<string, unknown>) => {
      calls.push([name, args]);
      return { data: results[name] ?? null, error: null };
    }),
    storage: { from: bucket },
  } as unknown as SupabaseClient;
  return { client, calls, uploads, removed };
}

const page = (fields: Partial<CmsItem> = {}): CmsItem => ({
  ...blankItem("page"), id: "content-7", title: "Office hours", slug: "office-hours", body: "Open daily.",
  updatedAt: "2026-11-25T00:00:00Z", ...fields,
});

describe("content workspace database calls", () => {
  it("creates a draft, then publishes it, in that order", async () => {
    const { client, calls } = fakeClient({ cms_save_content: 12 });
    const id = await applyItemState(client, null, { ...page({ id: "" }), status: "published" }, {});
    expect(id).toBe("content-12");
    expect(calls.map(([name]) => name)).toEqual(["cms_save_content", "cms_set_status"]);
    expect(calls[0][1]).toMatchObject({ p_id: null, p_type: "page", p_slug: "office-hours", p_summary: "Open daily." });
    expect(calls[1][1]).toEqual({ p_kind: "content", p_id: 12, p_status: "published" });
  });

  it("only changes the status when nothing else changed", async () => {
    const { client, calls } = fakeClient();
    await applyItemState(client, page(), page({ status: "archived" }), {});
    expect(calls).toEqual([["cms_set_status", { p_kind: "content", p_id: 7, p_status: "archived" }]]);
  });

  it("moves to Trash, and restores before editing an item in Trash", async () => {
    const trash = fakeClient();
    await applyItemState(trash.client, page(), page({ deletedAt: "2026-11-25T01:00:00Z" }), {});
    expect(trash.calls).toEqual([["cms_trash", { p_kind: "content", p_id: 7, p_restore: false }]]);

    const restore = fakeClient({ cms_save_content: 7 });
    await applyItemState(restore.client, page({ deletedAt: "2026-11-25T01:00:00Z" }), page({ status: "draft" }), {});
    expect(restore.calls).toEqual([["cms_trash", { p_kind: "content", p_id: 7, p_restore: true }]]);
  });

  it("undoes a create by moving the item to Trash", async () => {
    const { client, calls } = fakeClient();
    await applyItemState(client, page(), null, {});
    expect(calls).toEqual([["cms_trash", { p_kind: "content", p_id: 7, p_restore: false }]]);
  });

  it("uploads a new PDF before saving the resource, and removes it if the save fails", async () => {
    const resource = { ...blankItem("resource"), id: "", title: "Enrollment checklist", category: "School Forms", fileName: "checklist.pdf", fileSize: 4 };
    const file = new File(["%PDF"], "Checklist.pdf", { type: "application/pdf" });
    const ok = fakeClient({ cms_save_resource: 3 });
    expect(await applyItemState(ok.client, null, resource, {}, file)).toBe("resource-3");
    expect(ok.uploads[0]).toMatch(/^resource-files\/uploads\/checklist-[a-z0-9]+\.pdf$/);
    expect(ok.calls[0][1]).toMatchObject({ p_id: null, p_storage_path: ok.uploads[0].replace("resource-files/", ""), p_file_size_bytes: 4 });

    const failing = fakeClient();
    (failing.client.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Category must be 1 to 60 characters" } });
    await expect(applyItemState(failing.client, null, resource, {}, file)).rejects.toThrow("Category must be 1 to 60 characters.");
    expect(failing.removed).toEqual([[failing.uploads[0].replace("resource-files/", "")]]);
  });

  it("removes a deleted resource's file", async () => {
    const { client, calls, removed } = fakeClient({ cms_delete: "uploads/old.pdf" });
    await removeItem(client, { ...blankItem("resource"), id: "resource-4", deletedAt: "2026-11-25T01:00:00Z" }, {});
    expect(calls).toEqual([["cms_delete", { p_kind: "resource", p_id: 4 }]]);
    expect(removed).toEqual([["uploads/old.pdf"]]);
  });

  it("reads events on their Philippine date and explains database errors in plain words", () => {
    expect(eventStartsAt("2026-12-04")).toBe("2026-12-04T00:00:00+08:00");
    expect(eventDay("2026-12-03T16:00:00Z")).toBe("2026-12-04");
    const { item, assets } = contentItem({
      contentId: 5, contentType: "event", title: "Open house", slug: "open-house", body: "Visit us.", eventStartsAt: "2026-12-03T16:00:00Z",
      publishedAt: null, updatedAt: "2026-11-25T00:00:00Z", status: "draft", updatedByName: "Terrence Corpuz",
      images: [{ id: "a", name: "hall.webp", alt: "School hall", src: "https://abc.supabase.co/storage/v1/object/public/content-images/2026/a.webp", width: 10, height: 5 }],
    });
    expect(item).toMatchObject({ id: "content-5", eventDate: "2026-12-04", status: "draft", updatedBy: "Terrence Corpuz", images: [{ id: "a", alt: "School hall" }] });
    expect(assets.a).toEqual({ src: expect.stringContaining("content-images"), width: 10, height: 5 });
    expect(cmsErrorMessage({ code: "23505", message: "duplicate key" })).toContain("already in use");
    expect(cmsErrorMessage(new TypeError("Failed to fetch"))).toContain("could not be reached");
  });
});
