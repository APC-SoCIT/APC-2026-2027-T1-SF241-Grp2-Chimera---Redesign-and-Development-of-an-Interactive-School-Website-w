// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdmissionsInquiry from "./AdmissionsInquiry.vue";
vi.mock("vue-router", () => ({ useRoute: () => ({ query: { topic: "visit" } }) }));

describe("admissions email inquiry", () => {
  it("starts with the requested topic, validates after blur, and does not pretend to send an inquiry", async () => {
    const wrapper = mount(AdmissionsInquiry);
    expect(wrapper.get<HTMLSelectElement>("#inquiry-topic").element.value).toBe("visit");
    const email = wrapper.get("#inquiry-email");
    await email.trigger("focusin"); await email.setValue("unfinished");
    expect(email.attributes("aria-invalid")).toBe("false");
    await email.trigger("focusout");
    expect(email.attributes("aria-invalid")).toBe("true");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get('[role="status"]').text()).toContain("Please complete");
    expect(wrapper.text()).toContain("opens your email app");
    await wrapper.get("#inquiry-topic").setValue("fees");
    expect(wrapper.find('a[href="mailto:sncsfinance@gmail.com"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
