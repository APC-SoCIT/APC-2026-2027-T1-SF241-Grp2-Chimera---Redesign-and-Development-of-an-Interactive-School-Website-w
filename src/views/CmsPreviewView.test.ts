// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CmsPreviewView from "./CmsPreviewView.vue";
import { blankItem } from "@/lib/cms/preview";
import { readLibrary, recordChange } from "@/lib/cms/history";
import { useCmsLibrary, writeCmsLibrary } from "@/lib/cms/store";

// The route guard verifies Admin access before this view opens; here the signed-in Admin is mocked.
const replace = vi.fn();
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("vue-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("vue-router")>()), useRouter: () => ({ replace }) }));
vi.mock("@/lib/supabase", () => ({
  getStaffSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { email: "ana@example.com", app_metadata: { chimera_staff_provisioning: { full_name: "Ana Reyes" } } } } } }),
      signOut,
    },
  }),
}));

describe("Trash removal confirmation", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
    const trashed = { ...blankItem("page"), id: "trash-test", title: "Disposable test page", deletedAt: "2026-11-18T06:00:00Z" };
    writeCmsLibrary(recordChange(readLibrary(null), trashed, "Trash test page"));
  });

  it("allows cancellation and removes the item only after confirmation", async () => {
    const wrapper = mount(CmsPreviewView, { global: { stubs: { RouterLink: true } } });
    await wrapper.find(".cms-sidebar-footer button").trigger("click");
    const remove = () => wrapper.get('[aria-label="Remove permanently Disposable test page"]');
    await remove().trigger("click");
    await flushPromises();
    expect(wrapper.get("dialog").element.open).toBe(true);
    expect(wrapper.get("dialog").text()).toContain("cannot be restored");
    expect(useCmsLibrary().value.items.some((item) => item.id === "trash-test")).toBe(true);
    await wrapper.get(".cms-dialog-actions button").trigger("click");
    expect(wrapper.find(".cms-trash-list").exists()).toBe(true);
    await remove().trigger("click");
    await wrapper.get(".cms-dialog-actions .cms-primary").trigger("click");
    expect(wrapper.text()).toContain("Trash is empty");
    expect(wrapper.get('[role="status"]').text()).toContain("permanently removed");
    expect(useCmsLibrary().value.changes.some((change) => change.after.id === "trash-test")).toBe(false);
    wrapper.unmount();
  });

  it("keeps the item in Trash if browser storage fails", async () => {
    const wrapper = mount(CmsPreviewView, { global: { stubs: { RouterLink: true } } });
    await wrapper.find(".cms-sidebar-footer button").trigger("click");
    await wrapper.get('[aria-label="Remove permanently Disposable test page"]').trigger("click");
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Full"); });
    await wrapper.get(".cms-dialog-actions .cms-primary").trigger("click");
    expect(useCmsLibrary().value.items.some((item) => item.id === "trash-test")).toBe(true);
    expect(wrapper.get("dialog").element.open).toBe(true);
    expect(wrapper.get("dialog [role=alert]").text()).toContain("could not be removed");
    storage.mockRestore();
    wrapper.unmount();
  });
});

describe("archived content", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
    const archived = { ...blankItem("announcement"), id: "archived-test", title: "Archived test notice", slug: "archived-test-notice",
      status: "archived" as const, updatedAt: "2099-01-01T00:00:00Z" };
    writeCmsLibrary(recordChange(readLibrary(null), archived, "Archived test notice"));
  });

  it("offers Restore to draft and Publish for an archived item, and restores it as a draft", async () => {
    const wrapper = mount(CmsPreviewView, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    const row = wrapper.findAll("tr").find((tr) => tr.text().includes("Archived test notice"))!;
    const actions = row.findAll(".cms-action-list button").map((button) => button.text());
    expect(actions).toEqual(["Edit", "Restore to draft", "Publish", "Move to Trash"]);
    await row.findAll(".cms-action-list button").find((button) => button.text() === "Restore to draft")!.trigger("click");
    await flushPromises();
    expect(wrapper.get("dialog").text()).toContain("out of the archive and back to Draft");
    expect(wrapper.get(".cms-dialog-actions .cms-primary").text()).toBe("Restore to draft");
    await wrapper.get(".cms-dialog-actions .cms-primary").trigger("click");
    await flushPromises();
    expect(useCmsLibrary().value.items.find((item) => item.id === "archived-test")?.status).toBe("draft");
    expect(wrapper.get('[role="status"]').text()).toContain("is now a draft");
    wrapper.unmount();
  });
});

describe("signed-in Admin", () => {
  beforeEach(() => vi.spyOn(window, "scrollTo").mockImplementation(() => {}));

  it("opens the workspace without a separate sign-in, shows the Admin and signs out through the staff portal", async () => {
    const wrapper = mount(CmsPreviewView, { global: { stubs: { RouterLink: { template: "<a><slot /></a>" } } } });
    await flushPromises();
    expect(wrapper.find("#cms-login-email").exists()).toBe(false);
    expect(wrapper.get("h1").text()).toBe("Content overview");
    expect(wrapper.get(".cms-profile").text()).toContain("Ana Reyes");
    expect(wrapper.get("#cms-navigation").text()).toContain("Dashboard overview");
    const signOutButton = wrapper.findAll(".cms-sidebar-footer button").find((button) => button.text() === "Sign out");
    await signOutButton!.trigger("click");
    await flushPromises();
    expect(signOut).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith({ name: "login" });
    wrapper.unmount();
  });
});
