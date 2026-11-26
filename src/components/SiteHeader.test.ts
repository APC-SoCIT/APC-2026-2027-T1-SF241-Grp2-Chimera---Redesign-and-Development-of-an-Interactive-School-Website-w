// @vitest-environment jsdom
/*
 * Author: Gian Mandac
 * Created Date: 20261120
 * Staff login button: staff reach the sign-in page from the header instead of typing /login.
 */
import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import SiteHeader from "./SiteHeader.vue";

function makeRouter() {
  const page = { template: "<div />" };
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: page },
      { path: "/search", name: "search", component: page },
      { path: "/:path(.*)*", component: page },
    ],
  });
}

// jsdom has no native top-layer dialog implementation; emulate its open/close events here.
enableAutoUnmount(afterEach);
const dialogPrototype = HTMLDialogElement.prototype;
const originalShow = Object.getOwnPropertyDescriptor(dialogPrototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(dialogPrototype, "close");
beforeAll(() => {
  Object.defineProperty(dialogPrototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(dialogPrototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { if (!this.hasAttribute("open")) return; this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
});
afterAll(() => {
  if (originalShow) Object.defineProperty(dialogPrototype, "showModal", originalShow); else Reflect.deleteProperty(dialogPrototype, "showModal");
  if (originalClose) Object.defineProperty(dialogPrototype, "close", originalClose); else Reflect.deleteProperty(dialogPrototype, "close");
});
function mountHeader(router: ReturnType<typeof makeRouter>) {
  return mount(SiteHeader, { attachTo: document.body, global: { plugins: [router] } });
}
function modal() { return new DOMWrapper(document.querySelector<HTMLDialogElement>("#public-search-dialog")!); }

describe("site header staff login", () => {
  it("keeps search available on public pages and submits the keyword through a shareable URL", async () => {
    const router = makeRouter();
    await router.push("/admissions");
    const wrapper = mountHeader(router);
    expect(modal().attributes("open")).toBeUndefined();
    await wrapper.get('button[aria-label="Open website search"]').trigger("click");
    expect(modal().attributes("open")).toBeDefined();
    expect(modal().get('form[role="search"]').attributes("aria-label")).toBe("School website search");
    expect(modal().get('label[for="public-search-keyword"]').text()).toBe("Search website");
    await modal().get('input[type="search"]').setValue("  birth certificate  ");
    await modal().get('form[role="search"]').trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("search");
    expect(router.currentRoute.value.query.q).toBe("birth certificate");
    expect(modal().attributes("open")).toBeUndefined();
    await router.push("/campus");
    expect(wrapper.find('button[aria-label="Open website search"]').exists()).toBe(true);
    wrapper.unmount();
  });
  it("focuses the search field and restores focus and page scrolling when closed", async () => {
    const router = makeRouter();
    await router.push("/");
    const wrapper = mountHeader(router);
    const trigger = wrapper.get('button[aria-label="Open website search"]');
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "auto";
    await trigger.trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(modal().get('input[type="search"]').element);
    expect(document.body.style.overflow).toBe("hidden");
    await modal().get('button[aria-label="Close search"]').trigger("click");
    expect(trigger.attributes("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger.element);
    expect(document.body.style.overflow).toBe("auto");
    wrapper.unmount();
    document.body.style.overflow = originalOverflow;
  });
  it("closes on Escape and outside clicks, preserves the query, and closes the mobile menu", async () => {
    const router = makeRouter();
    await router.push("/search?q=library");
    const wrapper = mountHeader(router);
    const menu = wrapper.get("details").element;
    menu.open = true;
    await wrapper.get('button[aria-label="Open website search"]').trigger("click");
    expect(menu.open).toBe(false);
    expect((modal().get('input[type="search"]').element as HTMLInputElement).value).toBe("library");
    await modal().trigger("cancel");
    expect(modal().attributes("open")).toBeUndefined();
    await wrapper.get('button[aria-label="Open website search"]').trigger("click");
    await modal().trigger("click", { clientX: 100, clientY: 100 });
    expect(modal().attributes("open")).toBeUndefined();
    wrapper.unmount();
  });
  it("keeps an empty search open and restores scrolling if the header unmounts", async () => {
    const router = makeRouter();
    await router.push("/");
    const wrapper = mountHeader(router);
    await wrapper.get('button[aria-label="Open website search"]').trigger("click");
    await modal().get('form[role="search"]').trigger("submit");
    expect(router.currentRoute.value.path).toBe("/");
    expect(modal().attributes("open")).toBeDefined();
    wrapper.unmount();
    expect(document.body.style.overflow).toBe("");
  });
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
