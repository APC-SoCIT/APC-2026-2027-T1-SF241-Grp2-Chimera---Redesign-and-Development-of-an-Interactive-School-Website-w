// @vitest-environment jsdom
/*
 * Author: Gian Mandac
 * Created Date: 20261120
 * Staff login button: staff reach the sign-in page from the header instead of typing /login.
 */
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import SiteHeader from "./SiteHeader.vue";

function makeRouter() {
  const page = { template: "<div />" };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: page },
      { path: "/:path(.*)*", component: page },
    ],
  });
}

describe("site header staff login", () => {
  it("links to the staff sign-in page from the desktop menu and the mobile menu", async () => {
    const router = makeRouter();
    await router.push("/");
    const wrapper = mount(SiteHeader, { global: { plugins: [router] } });
    const desktop = wrapper.get(".desktop-nav .nav-staff-login");
    const mobile = wrapper.get(".mobile-menu .mobile-staff-login");
    expect(desktop.text()).toBe("Staff login");
    expect(desktop.attributes("href")).toBe("/login");
    expect(mobile.text()).toBe("Staff login");
    expect(mobile.attributes("href")).toBe("/login");

    await desktop.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/login");
    wrapper.unmount();
  });
});
