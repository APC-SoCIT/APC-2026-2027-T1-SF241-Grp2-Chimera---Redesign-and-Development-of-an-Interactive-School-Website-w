/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 */
// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RouterView } from "vue-router";
import router from "@/router";

const { auth, rpc } = vi.hoisted(() => ({
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => ({ auth, rpc }) }));
vi.mock("vue-router", async (importOriginal) => {
  const original = await importOriginal<typeof import("vue-router")>();
  return { ...original, createWebHistory: original.createMemoryHistory };
});

const teacherHeading = "Teacher dashboard";
let page: VueWrapper;

// Model Auth events while the production router, session check, and dashboard stay connected.
function emitAuth(event: AuthChangeEvent, secondsUntilExpiry: number | null) {
  const session = secondsUntilExpiry === null
    ? null
    : { expires_at: Math.floor(Date.now() / 1000) + secondsUntilExpiry };
  auth.getSession.mockResolvedValue({ data: { session }, error: null });
  const listener = auth.onAuthStateChange.mock.lastCall?.[0] as
    ((event: AuthChangeEvent, session: Pick<Session, "expires_at"> | null) => void) | undefined;
  listener?.(event, session);
}

async function openPortal() {
  await router.push("/teacher");
  await flushPromises();
}

function expectSignInPage() {
  expect(router.currentRoute.value.path).toBe("/login");
  expect(page.get("h1").text()).toBe("Welcome back.");
  expect(page.text()).not.toContain(teacherHeading);
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  rpc.mockResolvedValue({ data: "teacher", error: null });
  emitAuth("INITIAL_SESSION", 10);
  await router.replace("/login");
  page = mount(RouterView, { global: { plugins: [router] } });
});

afterEach(() => {
  page.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Teacher Route Access Tests START
it.each(["admin", "registrar", null])("blocks the Teacher dashboard for portal role %s", async (role) => {
  rpc.mockResolvedValue({ data: role, error: null });
  await openPortal();
  expect(rpc).toHaveBeenCalledWith("get_staff_portal_role");
  expectSignInPage();
});

it.each([null, 0])("blocks a missing or expired session (%s seconds left)", async (secondsUntilExpiry) => {
  emitAuth("INITIAL_SESSION", secondsUntilExpiry);
  await openPortal();
  expectSignInPage();
  expect(rpc).not.toHaveBeenCalled();
});

it("blocks the Teacher dashboard if the role check fails", async () => {
  rpc.mockResolvedValue({ data: null, error: new Error("Offline") });
  await openPortal();
  expectSignInPage();
});
// Teacher Route Access Tests END

// Teacher Session Tests START
it("signs out the current Teacher session and blocks a direct revisit", async () => {
  await openPortal();
  expect(page.get("h1").text()).toBe(teacherHeading);
  auth.signOut.mockImplementation(async () => {
    emitAuth("SIGNED_OUT", null);
    return { error: null };
  });
  await page.get("button").trigger("click");
  await flushPromises();
  expect(auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expectSignInPage();
  await openPortal();
  expectSignInPage();
});

it("removes the open Teacher dashboard after a sign-out event from another tab", async () => {
  await openPortal();
  expect(page.get("h1").text()).toBe(teacherHeading);
  emitAuth("SIGNED_OUT", null);
  await flushPromises();
  expectSignInPage();
});

it("keeps Teacher access through refresh and removes it at the new expiry", async () => {
  await openPortal();
  expect(page.get("h1").text()).toBe(teacherHeading);
  emitAuth("INITIAL_SESSION", 10);
  vi.advanceTimersByTime(5000);
  emitAuth("TOKEN_REFRESHED", 10);
  vi.advanceTimersByTime(5000);
  await flushPromises();
  expect(page.get("h1").text()).toBe(teacherHeading);
  vi.advanceTimersByTime(5000);
  await flushPromises();
  expectSignInPage();
  await openPortal();
  expectSignInPage();
});
// Teacher Session Tests END
