// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import CmsContactEditor from "./CmsContactEditor.vue";
import { defaultContactDetails } from "@/lib/content/contact";

const storageKey = "sncs-cms-contact-details";
const mountEditor = async () => {
  const wrapper = mount(CmsContactEditor, { props: { connected: false, actor: "Ana Reyes" }, attachTo: document.body });
  await flushPromises();
  return wrapper;
};

describe("Contact details editor", () => {
  beforeEach(() => localStorage.clear());

  it("shows the current details and saves an edit with the editor's name", async () => {
    const wrapper = await mountEditor();
    const address = wrapper.get<HTMLTextAreaElement>("#contact-address");
    expect(address.element.value).toBe(defaultContactDetails.address);
    expect(wrapper.get("button[type=submit]").attributes("disabled")).toBeDefined();
    expect(wrapper.get(".cms-record-details").text()).toContain("Not edited yet");

    await address.setValue("  123 New Street, Taguig City ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    expect(saved.details.address).toBe("123 New Street, Taguig City");
    expect(saved.details.offices).toEqual(defaultContactDetails.offices);
    expect(saved.updatedBy).toBe("Ana Reyes");
    expect(wrapper.get('[role="status"]').text()).toContain("Contact details saved");
    expect(wrapper.get(".cms-record-details").text()).toContain("Ana Reyes");
    expect(wrapper.emitted("dirty")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("checks each field before saving and keeps the saved copy unchanged", async () => {
    const wrapper = await mountEditor();
    const phone = wrapper.get("#contact-phone");
    await phone.setValue("call the office");
    await phone.trigger("focusin");
    await phone.trigger("focusout");
    expect(wrapper.text()).toContain("Enter a phone number, for example (02) 8837-9702.");
    expect(wrapper.emitted("dirty")?.at(-1)).toEqual([true]);

    // A new link needs a https:// address and the text visitors will see.
    const registrar = wrapper.findAll("fieldset")[0];
    await registrar.findAll("button").find((button) => button.text().startsWith("Add a way to reach"))!.trigger("click");
    const kinds = registrar.findAll("select");
    await kinds.at(-1)!.setValue("link");
    const value = registrar.findAll("input").filter((input) => input.attributes("type") === "url").at(-1)!;
    await value.setValue("http://example.com");

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Review the highlighted fields");
    expect(localStorage.getItem(storageKey)).toBeNull();

    await wrapper.findAll("button").find((button) => button.text() === "Discard changes")!.trigger("click");
    expect(wrapper.get<HTMLInputElement>("#contact-phone").element.value).toBe(defaultContactDetails.mainPhone);
    expect(wrapper.emitted("dirty")?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it("adds, reorders and removes offices", async () => {
    const wrapper = await mountEditor();
    await wrapper.findAll("button").find((button) => button.text().includes("Add office"))!.trigger("click");
    const fieldsets = () => wrapper.findAll("fieldset");
    expect(fieldsets()).toHaveLength(5);
    const fresh = fieldsets()[4];
    await fresh.get("input[type=text]").setValue("Guidance Office");
    await fresh.get("input[type=tel]").setValue("(02) 8000-1234");
    await fresh.get('[aria-label="Move Guidance Office up"]').trigger("click");
    expect(fieldsets()[3].get("legend").text()).toBe("Guidance Office");
    await fieldsets()[0].get('[aria-label="Remove Registrar / Admissions"]').trigger("click");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    expect(saved.details.offices.map((office: { slug: string }) => office.slug)).toEqual(["principal", "finance", "guidance-office", "library"]);
    wrapper.unmount();
  });
});
