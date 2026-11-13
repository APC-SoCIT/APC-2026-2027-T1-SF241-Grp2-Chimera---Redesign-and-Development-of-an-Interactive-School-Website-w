/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261111
 */
// @vitest-environment jsdom
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginView from "./LoginView.vue";

describe("staff login preview", () => {
  let wrapper: VueWrapper;
  function render() {
    wrapper = mount(LoginView, { attachTo: document.body, global: { stubs: {
      RouterLink: { template: '<a><slot /></a>' },
    } } });
  }
  afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

  it("validates fields and focuses the first invalid field without submitting credentials", async () => {
    render();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("#login-email").attributes("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(wrapper.get("#login-email").element);
    await wrapper.get("#login-email").setValue("invalid");
    expect(wrapper.get("#email-error").text()).toBe("Enter a valid email address.");
    await wrapper.get("#login-email").setValue("staff@example.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("#login-email").attributes("aria-invalid")).toBe("false");
    expect(document.activeElement).toBe(wrapper.get("#login-password").element);
  });

  it("toggles password visibility without altering the password", async () => {
    render();
    await wrapper.get("#login-password").setValue(" example password ");
    await wrapper.get('[aria-label="Show password"]').trigger("click");
    expect(wrapper.get("#login-password").attributes("type")).toBe("text");
    expect((wrapper.get("#login-password").element as HTMLInputElement).value).toBe(" example password ");
    await wrapper.get('[aria-label="Hide password"]').trigger("click");
    expect(wrapper.get("#login-password").attributes("type")).toBe("password");
  });

  it("fails closed in the UI preview and never sends credentials or implies successful authentication", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render();
    await wrapper.get("#login-email").setValue("staff@example.com");
    await wrapper.get("#login-password").setValue("example-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Sign-in is currently unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    await wrapper.get("#login-email").setValue("other@example.com");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("provides actionable password-reset assistance", async () => {
    render();
    await wrapper.get(".login-text-button").trigger("click");
    expect(wrapper.get(".login-text-button").attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#login-password-help").text()).toContain("Contact the school administrator");
  });
});
