// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CmsSignIn from "./CmsSignIn.vue";

describe("staff sign-in fields", () => {
  it("keeps labels outside inputs and exposes appropriate email and password autofill", () => {
    const wrapper = mount(CmsSignIn);
    const email = wrapper.get("#cms-login-email");
    const password = wrapper.get("#cms-login-password");
    expect(wrapper.get('label[for="cms-login-email"]').text()).toBe("Email address");
    expect(wrapper.get('label[for="cms-login-password"]').text()).toBe("Password");
    expect(email.attributes()).toMatchObject({ type: "email", inputmode: "email", autocomplete: "username", placeholder: "name@example.com" });
    expect(password.attributes()).toMatchObject({ type: "password", autocomplete: "current-password", placeholder: "Password" });
    wrapper.unmount();
  });

  it("shows errors only after blur and hides them throughout editing", async () => {
    const wrapper = mount(CmsSignIn);
    const email = wrapper.get("#cms-login-email");
    await email.trigger("focusin");
    await email.setValue("incomplete");
    expect(email.attributes("aria-invalid")).toBe("false");
    expect(wrapper.find("#cms-email-error").exists()).toBe(false);
    await email.trigger("focusout");
    expect(email.attributes("aria-invalid")).toBe("true");
    expect(email.attributes("aria-describedby")).toBe("cms-email-error");
    expect(wrapper.get("#cms-email-error").text()).toContain("name@example.com");
    await email.trigger("focusin");
    await email.setValue("still-incomplete");
    expect(email.attributes("aria-invalid")).toBe("false");
    expect(wrapper.find("#cms-email-error").exists()).toBe(false);
    await email.setValue("name@example.com");
    await email.trigger("focusout");
    expect(email.attributes("aria-invalid")).toBe("false");

    const password = wrapper.get("#cms-login-password");
    await password.trigger("focusin");
    await password.trigger("focusout");
    expect(wrapper.get("#cms-password-error").text()).toBe("Enter your password.");
    await password.trigger("focusin");
    await password.setValue("password");
    expect(password.attributes("aria-invalid")).toBe("false");
    wrapper.unmount();
  });

  it("still blocks incomplete submissions and signs in with valid credentials", async () => {
    const wrapper = mount(CmsSignIn);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("signIn")).toBeUndefined();
    // Submission does not turn untouched fields red.
    expect(wrapper.get("#cms-login-email").attributes("aria-invalid")).toBe("false");
    await wrapper.get("#cms-login-email").setValue("admin@sncs.example");
    await wrapper.get("#cms-login-password").setValue("SNCS-Preview-26!");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("signIn")).toHaveLength(1);
    wrapper.unmount();
  });
});
