// @vitest-environment jsdom
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import type { ContentRow } from "./database";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./config", () => ({ cmsDatabaseEnabled: true, cmsPreviewEnabled: true }));
vi.mock("@/lib/supabase", () => ({ getPublicSupabaseClient: () => ({ rpc }) }));
const row = (fields: Partial<ContentRow> = {}): ContentRow => ({
  contentId: 1, contentType: "page", title: "Privacyneedle public page", slug: "privacyneedle-public",
  body: "Privacyneedle public guidance", eventStartsAt: null, status: "published", visibility: "public",
  publishedAt: "2026-11-26T00:00:00Z", updatedAt: "2026-11-26T00:00:00Z", deletedAt: null, ...fields,
});

function deferContentResponse() {
  let respond!: (data: ContentRow[]) => void;
  const pending = new Promise(resolve => {
    respond = data => resolve({ data, error: null });
  });
  rpc.mockReturnValueOnce(pending);
  return respond;
}

enableAutoUnmount(afterEach);
beforeEach(() => { vi.resetModules(); rpc.mockReset(); vi.stubEnv("SSR", false); });
afterEach(() => vi.unstubAllEnvs());

describe("public pages and search share CMS visibility", () => {
  it("keeps published private pages and announcements out of both views even if an RPC response contains them", async () => {
    const records = [row(), row({ contentId: 2, contentType: "announcement", title: "Privacyneedle public notice", slug: "privacyneedle-notice" })];
    for (const type of ["page", "announcement"] as const) {
      records.push(row({ contentId: records.length + 1, contentType: type, title: `Privacyneedle private ${type}`, slug: "private-" + type, visibility: "private" }));
      records.push(row({ contentId: records.length + 1, contentType: type, title: `Privacyneedle archived ${type}`, slug: "archived-" + type, status: "archived" }));
      records.push(row({ contentId: records.length + 1, contentType: type, title: `Privacyneedle draft ${type}`, slug: "draft-" + type, status: "draft" }));
      records.push(row({ contentId: records.length + 1, contentType: type, title: `Privacyneedle trashed ${type}`, slug: "trashed-" + type, deletedAt: "2026-11-26T01:00:00Z" }));
    }
    rpc.mockResolvedValue({ data: records, error: null });
    const { usePublicWebsite, refreshPublishedContent } = await import("./public-website");
    const { usePublicSearch } = await import("../search/public-search");
    const website = usePublicWebsite();
    const search = usePublicSearch();
    await refreshPublishedContent();
    expect(rpc).toHaveBeenCalledWith("cms_public_content");
    expect(website.pages.value.map(item => item.title)).toEqual(["Privacyneedle public page"]);
    expect(website.announcements.value.map(item => item.title)).toEqual(["Privacyneedle public notice"]);
    expect(search.find("privacyneedle").map(item => item.title).sort()).toEqual(["Privacyneedle public notice", "Privacyneedle public page"]);
    expect(search.find("private")).toEqual([]);
  });
  it("does not show built-in notices while loading, on failure, or when the CMS returns an empty list", async () => {
    rpc.mockResolvedValueOnce({ data: [row({ contentType: "announcement" })], error: null });
    const { usePublicWebsite, refreshPublishedContent } = await import("./public-website");
    const website = usePublicWebsite();
    expect(website.announcements.value).toEqual([]);
    await refreshPublishedContent();
    expect(website.announcements.value).toHaveLength(1);

    rpc.mockResolvedValueOnce({ data: null, error: { message: "Offline" } });
    await website.refresh();
    expect(website.error.value).not.toBe("");
    expect(website.announcements.value).toEqual([]);

    rpc.mockResolvedValue({ data: [], error: null });
    await website.refresh();
    expect(website.error.value).toBe("");
    expect(website.announcements.value).toEqual([]);
  });
  it("removes previously published content from pages and search on refresh", async () => {
    rpc.mockResolvedValue({ data: [row()], error: null });
    const { usePublicWebsite, refreshPublishedContent } = await import("./public-website");
    const { usePublicSearch } = await import("../search/public-search");
    const website = usePublicWebsite();
    const search = usePublicSearch();
    await refreshPublishedContent();
    expect(search.find("privacyneedle")).toHaveLength(1);

    const respond = deferContentResponse();
    const refresh = website.refresh();
    expect(search.find("privacyneedle")).toHaveLength(1);
    expect(search.loading.value).toBe(false);
    respond([]);
    await refresh;
    expect(website.pages.value).toEqual([]);
    expect(search.find("privacyneedle")).toEqual([]);
  });
  it("preserves the focused search result through a background refresh", async () => {
    const notice = row({ contentType: "announcement", slug: "privacyneedle-notice" });
    rpc.mockResolvedValueOnce({ data: [notice], error: null });
    const { default: SearchView } = await import("../../views/SearchView.vue");
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: "/search", component: SearchView },
      { path: "/news/:slug", component: { template: "<div />" } },
    ] });
    await router.push("/search?q=privacyneedle");
    const view = mount(SearchView, { attachTo: document.body, global: { plugins: [router] } });
    await flushPromises();
    const link = view.get<HTMLAnchorElement>('a[href="/news/privacyneedle-notice"]').element;
    link.focus();

    const respond = deferContentResponse();
    window.dispatchEvent(new Event("focus"));
    await nextTick();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(link);
    respond([notice]);
    await flushPromises();
    expect(document.activeElement).toBe(link);
  });
  it("waits for a fresh publication response before declaring an announcement missing", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const { refreshPublishedContent } = await import("./public-website");
    await refreshPublishedContent();

    const { default: AnnouncementView } = await import("../../views/AnnouncementView.vue");
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: "/news/:slug", component: AnnouncementView },
      { path: "/:pathMatch(.*)*", component: { template: "<div />" } },
    ] });
    await router.push("/news/new-notice");
    const respond = deferContentResponse();
    const view = mount(AnnouncementView, { global: { plugins: [router] } });
    expect(view.get('[role="status"]').text()).toBe("Loading announcement…");
    respond([row({ contentType: "announcement", slug: "new-notice", title: "New notice" })]);
    await flushPromises();
    expect(view.get("h1").text()).toBe("New notice");
  });
  it("does not bake built-in notices into a database-backed prerender", async () => {
    vi.stubEnv("SSR", true);
    const { usePublicWebsite } = await import("./public-website");
    const website = usePublicWebsite();
    expect(website.loading.value).toBe(true);
    expect(website.announcements.value).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
