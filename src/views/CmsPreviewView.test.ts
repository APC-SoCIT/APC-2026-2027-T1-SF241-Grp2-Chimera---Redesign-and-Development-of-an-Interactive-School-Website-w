// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CmsPreviewView from "./CmsPreviewView.vue";
import { blankItem } from "@/lib/cms/preview";
import { readLibrary, recordChange } from "@/lib/cms/history";
import { useCmsLibrary, writeCmsLibrary } from "@/lib/cms/store";

describe("Trash removal confirmation", () => {
  beforeEach(() => {
    sessionStorage.setItem("sncs-cms-preview-session", "signed-in");
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
