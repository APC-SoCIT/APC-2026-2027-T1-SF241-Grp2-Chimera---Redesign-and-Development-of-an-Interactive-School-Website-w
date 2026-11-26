// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import { blankItem, type CmsItem } from "@/lib/cms/preview";
import type { Announcement } from "@/lib/content/model";
import SearchView from "./SearchView.vue";

vi.mock("@/lib/cms/public-website", () => ({ usePublicWebsite: () => website }));
const website = {
  announcements: ref<Announcement[]>([]), pages: ref<CmsItem[]>([]),
  initialLoading: ref(false), error: ref(""), refresh: vi.fn(async () => {}),
};
async function openSearch(query = "needlemark") {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: "/search", component: SearchView }, { path: "/:path(.*)*", component: { template: "<div />" } },
  ] });
  await router.push({ path: "/search", query: { q: query } });
  const wrapper = mount(SearchView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}
beforeEach(() => {
  website.announcements.value = [];
  website.pages.value = [];
  website.initialLoading.value = false;
  website.error.value = "";
  website.refresh.mockClear();
});

describe("public search uses the existing CMS", () => {
  it("displays titles, excerpts and links from the website's shared published content", async () => {
    website.announcements.value = [{
      ...blankItem("announcement"), id: "notice", status: "published", publishedAt: null,
      title: "Needlemark notice", slug: "needlemark-notice", category: "School Advisory", body: ["Bring your report card."], summary: "Bring your report card.",
    }];
    website.pages.value = [{
      ...blankItem("page"), id: "page", status: "published", title: "Needlemark guide", slug: "needlemark-guide", body: "## Guidance\nPrepare your documents.",
    }];
    const { wrapper } = await openSearch();
    expect(wrapper.get('[role="status"]').text()).toBe("2 results found");
    expect(wrapper.get('a[href="/pages/needlemark-guide"]').text()).toBe("Needlemark guide");
    expect(wrapper.get('a[href="/news/needlemark-notice"]').text()).toBe("Needlemark notice");
    expect(wrapper.text()).toContain("Bring your report card.");
    wrapper.unmount();
  });
  it("shows No results found, refreshes on a new query and follows live CMS changes", async () => {
    const { wrapper, router } = await openSearch("unmatched");
    expect(wrapper.get('[role="status"]').text()).toBe("No results found");
    await router.push("/search?q=needlemark");
    await flushPromises();
    expect(website.refresh).toHaveBeenCalled();
    website.pages.value = [{ ...blankItem("page"), id: "page", status: "published", title: "Needlemark guide", slug: "needlemark", body: "Current guidance." }];
    await flushPromises();
    expect(wrapper.text()).toContain("1 result found");
    website.pages.value[0].status = "archived";
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe("No results found");
    wrapper.unmount();
  });
  it("shows loading and retry feedback rather than claiming no matches on a CMS error", async () => {
    website.initialLoading.value = true;
    const { wrapper } = await openSearch();
    expect(wrapper.get('[role="status"]').text()).toBe("Searching published content…");
    website.initialLoading.value = false;
    website.error.value = "School updates could not be loaded. Please try again.";
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("School updates could not be loaded");
    expect(wrapper.text()).not.toContain("No results found");
    await wrapper.get("button").trigger("click");
    expect(website.refresh).toHaveBeenCalled();
    wrapper.unmount();
  });
});
