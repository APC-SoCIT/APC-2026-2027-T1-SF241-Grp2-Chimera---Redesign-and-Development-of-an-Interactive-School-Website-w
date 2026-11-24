// @vitest-environment jsdom
import { mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import HomeView from "./HomeView.vue";

const events = ref<unknown[]>([]);
vi.mock("@/lib/cms/public-website", () => ({ usePublicWebsite: () => ({
  pages: ref([]), events,
  announcements: ref([
    { id: "office-transactions", title: "School office transactions" },
    { id: "genyo", title: "Learning platform update", slug: "learning-platform", category: "School update", summary: "Platform information", publishedAt: null },
  ]),
}) }));

afterEach(() => vi.useRealTimers());
describe("parent-focused homepage", () => {
  it("shows admissions and learning levels before family resources and keeps missing dates honest", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-19T04:00:00Z"));
    events.value = [{ id: "past", startDate: "2026-09-26", endDate: "2026-09-26", title: "Past school activity" }];
    const wrapper = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(wrapper.get("h1").text()).toContain("Forming learners");
    expect(wrapper.find("canvas").exists()).toBe(false);
    expect(wrapper.find(".school-hero-photo").exists()).toBe(true);
    expect(wrapper.findAll(".learning-level")).toHaveLength(4);
    expect(wrapper.html().indexOf('id="learning-levels"')).toBeLessThan(wrapper.html().indexOf('id="current-families"'));
    expect(wrapper.get(".school-updates").text()).not.toContain("School office transactions");
    expect(wrapper.get(".school-updates").text()).toContain("Publication date not provided");
    expect(wrapper.get(".calendar-editorial").text()).toContain("Previously announced");
    expect(wrapper.get(".calendar-editorial").text()).toContain("September 26, 2026");
    wrapper.unmount();
  });

  it("shows upcoming published dates when the school supplies them", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-19T04:00:00Z"));
    events.value = [{ id: "upcoming", startDate: "2026-12-01", endDate: "2026-12-01", title: "Test upcoming activity" }];
    const wrapper = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    expect(wrapper.get(".calendar-editorial").text()).toContain("Coming up at SNCS");
    expect(wrapper.get(".calendar-editorial").text()).toContain("December 1, 2026");
    expect(wrapper.get(".calendar-editorial").text()).not.toContain("Previously announced");
    wrapper.unmount();
  });
});
