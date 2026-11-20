/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261119
 * Modified by: Gian Mandac (portal bar test)
 * Modified Date: 20261119
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261120
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StaffDashboardView from "./StaffDashboardView.vue";

const { onAuthStateChange, signOut, unsubscribe, replace, getStaffPortalRole } = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn(), replace: vi.fn(), getStaffPortalRole: vi.fn(),
}));
vi.mock("@/lib/staff-auth", () => ({ getStaffPortalRole }));
vi.mock("@/components/StaffAccountsPanel.vue", () => ({ default: {
  template: '<div data-testid="staff-list">Admin Private — admin-private@example.com</div>',
} }));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => ({ auth: { onAuthStateChange, signOut } }) }));
vi.mock("vue-router", () => ({ RouterLink: { template: "<a><slot /></a>" }, useRouter: () => ({ replace }) }));

let dashboard: ReturnType<typeof mount>;

function emit(event: AuthChangeEvent, secondsUntilExpiry: number | null, userId = "admin-id") {
  const listener = onAuthStateChange.mock.calls[0][0] as (event: AuthChangeEvent, session: Pick<Session, "expires_at" | "user"> | null) => void;
  listener(event, secondsUntilExpiry === null ? null : {
    expires_at: Date.now() / 1000 + secondsUntilExpiry, user: { id: userId } as Session["user"],
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  getStaffPortalRole.mockResolvedValue("admin");
  dashboard = mount(StaffDashboardView, { props: { heading: "Admin dashboard", role: "admin" } });
});

afterEach(() => {
  dashboard.unmount();
  vi.useRealTimers();
});

it("leaves the open dashboard when a session expires without refresh", () => {
  emit("INITIAL_SESSION", 2);
  vi.advanceTimersByTime(2000);
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});

it("keeps the dashboard open after refresh and uses the new expiry", () => {
  emit("INITIAL_SESSION", 2);
  vi.advanceTimersByTime(1000);
  emit("TOKEN_REFRESHED", 3);
  vi.advanceTimersByTime(1000);
  expect(replace).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2000);
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});

it("leaves the dashboard when another tab signs out", () => {
  emit("INITIAL_SESSION", 2);
  emit("SIGNED_OUT", null);
  vi.advanceTimersByTime(2000);
  expect(replace).toHaveBeenCalledExactlyOnceWith({ name: "login" });
});

it("signs out the current session and returns to login", async () => {
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  signOut.mockResolvedValue({ error: null });
  await dashboard.get("button").trigger("click");
  await flushPromises();
  expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});

// Account Switch Regression START
it.each(["SIGNED_IN", "TOKEN_REFRESHED"] as const)("preserves the same Admin panel across %s while access is rechecked", async (event) => {
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  const originalPanel = dashboard.get('[data-testid="staff-list"]').element;
  let complete!: (role: "admin") => void;
  getStaffPortalRole.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  emit(event, 20);
  await nextTick();
  expect(dashboard.get('[data-testid="staff-list"]').element).toBe(originalPanel);
  await vi.advanceTimersByTimeAsync(0);
  expect(getStaffPortalRole).toHaveBeenCalledTimes(2);
  complete("admin");
  await flushPromises();
  expect(dashboard.get('[data-testid="staff-list"]').element).toBe(originalPanel);
  expect(replace).not.toHaveBeenCalled();
});

it("keeps protected records unmounted until initial access is verified", async () => {
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(false);
  emit("INITIAL_SESSION", 10);
  expect(getStaffPortalRole).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(true);
});

it("unmounts cached Admin records immediately when another tab switches to Teacher", async () => {
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.text()).toContain("admin-private@example.com");
  getStaffPortalRole.mockResolvedValue("teacher");
  emit("SIGNED_IN", 10, "teacher-id");
  await nextTick();
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(false);
  expect(dashboard.text()).not.toContain("admin-private@example.com");
  await vi.advanceTimersByTimeAsync(0);
  expect(replace).toHaveBeenCalledWith({ name: "login" });
  expect(dashboard.text()).not.toContain("admin-private@example.com");
});

it("ignores an old access check that resolves after the session changes", async () => {
  let complete!: (role: "admin") => void;
  getStaffPortalRole.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  getStaffPortalRole.mockResolvedValue("teacher");
  emit("SIGNED_IN", 10, "teacher-id");
  await vi.advanceTimersByTimeAsync(0);
  complete("admin");
  await flushPromises();
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(false);
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});

it("recreates the panel when switching between two accounts with the same role", async () => {
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  const previousPanel = dashboard.get('[data-testid="staff-list"]').element;
  emit("SIGNED_IN", 10, "other-admin-id");
  await nextTick();
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.get('[data-testid="staff-list"]').element).not.toBe(previousPanel);
  expect(replace).not.toHaveBeenCalled();
});

it.each(["denied", "unavailable"])("clears existing records when renewed access is %s", async (result) => {
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.text()).toContain("admin-private@example.com");
  if (result === "denied") getStaffPortalRole.mockResolvedValue("teacher");
  else getStaffPortalRole.mockRejectedValue(new Error("Offline"));
  emit("TOKEN_REFRESHED", 10);
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.text()).not.toContain("admin-private@example.com");
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});

it("does not restore protected records if access resolves after expiry", async () => {
  let complete!: (role: "admin") => void;
  getStaffPortalRole.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  emit("INITIAL_SESSION", 1);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(1000);
  complete("admin");
  await flushPromises();
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(false);
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});
// Account Switch Regression END

it("opens the Coordinator dashboard with its own role and no Admin account panel", async () => {
  emit("INITIAL_SESSION", 10);
  await vi.advanceTimersByTimeAsync(0);
  await dashboard.setProps({ heading: "Academic Coordinator dashboard", role: "academic_coordinator" });
  getStaffPortalRole.mockResolvedValue("academic_coordinator");
  emit("INITIAL_SESSION", 10, "coordinator-id");
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.get("h1").text()).toBe("Academic Coordinator dashboard");
  expect(dashboard.find('[data-testid="staff-list"]').exists()).toBe(false);
  expect(dashboard.get(".portal-user-role").text()).toBe("Academic Coordinator");
  expect(replace).not.toHaveBeenCalled();
});

it("shows the SNCS seal and the signed-in staff member's name once access is verified", async () => {
  const listener = onAuthStateChange.mock.calls[0][0] as (event: AuthChangeEvent, session: unknown) => void;
  listener("INITIAL_SESSION", {
    expires_at: Date.now() / 1000 + 60,
    user: { id: "admin-id", email: "ana@example.com", app_metadata: { chimera_staff_provisioning: { full_name: "Ana Reyes" } } },
  });
  expect(dashboard.find("img").exists()).toBe(false);
  await vi.advanceTimersByTimeAsync(0);
  expect(dashboard.get("img").attributes("alt")).toContain("Sto. Niño Catholic School");
  expect(dashboard.text()).toContain("Ana Reyes");
  expect(dashboard.get(".portal-avatar").text()).toBe("AR");
});
