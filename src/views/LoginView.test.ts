/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261111
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
// @vitest-environment jsdom
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffPortalRole, signInStaff } from "@/lib/staff-auth";
import router from "@/router";
import LoginView from "./LoginView.vue";

vi.mock("@/lib/staff-auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/staff-auth")>(),
  getStaffPortalRole: vi.fn(),
  signInStaff: vi.fn(),
}));
vi.mock("vue-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("vue-router")>();
  return { ...original, createWebHistory: original.createMemoryHistory };
});

describe("staff login and protected routes", () => {
  let wrapper: VueWrapper | undefined;
  function render() {
    wrapper = mount(LoginView, { attachTo: document.body, global: { plugins: [router] } });
    return wrapper;
  }
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    await router.replace({ name: "login" });
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.restoreAllMocks();
  });

  it("validates fields and focuses the first invalid field without submitting credentials", async () => {
    const wrapper = render();
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
    expect(signInStaff).not.toHaveBeenCalled();
  });

  it("toggles password visibility without altering the password", async () => {
    const wrapper = render();
    await wrapper.get("#login-password").setValue(" example password ");
    await wrapper.get('[aria-label="Show password"]').trigger("click");
    expect(wrapper.get("#login-password").attributes("type")).toBe("text");
    expect((wrapper.get("#login-password").element as HTMLInputElement).value).toBe(" example password ");
    await wrapper.get('[aria-label="Hide password"]').trigger("click");
    expect(wrapper.get("#login-password").attributes("type")).toBe("password");
  });

  it.each(["admin", "registrar", "teacher"] as const)("opens the guarded dashboard after a valid %s login", async (role) => {
    vi.mocked(signInStaff).mockResolvedValue(role);
    vi.mocked(getStaffPortalRole).mockResolvedValue(role);
    const wrapper = render();
    await wrapper.get("#login-email").setValue("staff@example.com");
    await wrapper.get("#login-password").setValue(" example password ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    // The dashboard is a lazy route. Wait for its module before asserting navigation.
    await vi.dynamicImportSettled();
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe(`/${role}`);
      expect((wrapper.get("#login-password").element as HTMLInputElement).value).toBe("");
    });
    expect(signInStaff).toHaveBeenCalledWith("staff@example.com", " example password ");
    expect(getStaffPortalRole).toHaveBeenCalledOnce();
  });

  it("stays on the login page when credentials or admin access are denied", async () => {
    vi.mocked(signInStaff).mockResolvedValue(null);
    const wrapper = render();
    await wrapper.get("#login-email").setValue("staff@example.com");
    await wrapper.get("#login-password").setValue("example-password");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Sign-in failed");
    expect(router.currentRoute.value.name).toBe("login");
    await wrapper.get("#login-email").setValue("other@example.com");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it.each([
    [null, "/admin"],
    [null, "/registrar"],
    [null, "/teacher"],
    ["registrar", "/admin"],
    ["admin", "/registrar"],
    ["admin", "/teacher"],
    ["registrar", "/teacher"],
    ["teacher", "/admin"],
    ["teacher", "/registrar"],
  ] as const)("redirects a %s session trying to open %s", async (role, path) => {
    vi.mocked(getStaffPortalRole).mockResolvedValue(role);
    await router.push(path);
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("requires a password change before opening a protected dashboard", async () => {
    vi.mocked(getStaffPortalRole).mockResolvedValue("password-change");
    await router.push("/teacher");
    expect(router.currentRoute.value.path).toBe("/login/change-password");
  });

  it("denies direct dashboard visits if the server cannot verify access", async () => {
    vi.mocked(getStaffPortalRole).mockRejectedValue(new Error("Offline"));
    await router.push("/admin");
    expect(router.currentRoute.value.name).toBe("login");
  });

  it("provides actionable password-reset assistance", async () => {
    const wrapper = render();
    await wrapper.get(".login-text-button").trigger("click");
    expect(wrapper.get(".login-text-button").attributes("aria-expanded")).toBe("true");
    expect(wrapper.get("#login-password-help").text()).toContain("Contact the school administrator");
  });
});
