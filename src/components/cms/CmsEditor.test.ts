// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CmsEditor from "./CmsEditor.vue";
import { blankItem } from "@/lib/cms/preview";

describe("editor field feedback", () => {
  it("validates title and body after blur, never during typing, and retains save validation", async () => {
    const attemptSave = vi.fn(() => true);
    const wrapper = mount(CmsEditor, { props: { item: blankItem("page"), items: [], imageAssets: {}, attemptSave } });
    const title = wrapper.get("#cms-title");
    await title.trigger("focusin");
    await title.setValue("   ");
    expect(title.attributes("aria-invalid")).toBe("false");
    await title.trigger("focusout");
    expect(title.attributes("aria-invalid")).toBe("true");
    await title.trigger("focusin");
    expect(wrapper.find("#cms-title-error").exists()).toBe(false);
    await title.setValue("School update");
    await title.trigger("focusout");
    expect(title.attributes("aria-invalid")).toBe("false");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(attemptSave).not.toHaveBeenCalled();
    expect(wrapper.get("#cms-body").attributes("aria-invalid")).toBe("false");
    await wrapper.get("#cms-body").trigger("focusin");
    await wrapper.get("#cms-body").trigger("focusout");
    expect(wrapper.get("#cms-body-error").text()).toBe("Enter the content body.");
    await wrapper.get("#cms-body").trigger("focusin");
    await wrapper.get("#cms-body").setValue("Latest campus news.");
    expect(wrapper.find("#cms-body-error").exists()).toBe(false);
    await wrapper.get("#cms-body").trigger("focusout");
    await wrapper.get("form").trigger("submit");
    expect(attemptSave).toHaveBeenCalledWith(expect.objectContaining({ title: "School update", body: "Latest campus news." }), {});
    wrapper.unmount();
  });

  it("validates image descriptions on blur with their own error associations", async () => {
    const item = { ...blankItem("page"), images: [{ id: "school-image", name: "campus.png", alt: "" }] };
    const wrapper = mount(CmsEditor, { props: { item, items: [], imageAssets: {}, attemptSave: () => true } });
    const alt = wrapper.get("#alt-school-image");
    await alt.trigger("focusin");
    await alt.trigger("focusout");
    expect(alt.attributes("aria-invalid")).toBe("true");
    expect(alt.attributes("aria-describedby")).toBe("image-error-school-image");
    await alt.trigger("focusin");
    await alt.setValue("School entrance");
    expect(alt.attributes("aria-invalid")).toBe("false");
    await alt.trigger("focusout");
    expect(wrapper.find("#image-error-school-image").exists()).toBe(false);
    wrapper.unmount();
  });
});
