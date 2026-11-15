/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StaffDashboardView from "./StaffDashboardView.vue";

const { onAuthStateChange, signOut, unsubscribe, replace } = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(), signOut: vi.fn(), unsubscribe: vi.fn(), replace: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => ({ auth: { onAuthStateChange, signOut } }) }));
vi.mock("vue-router", () => ({ RouterLink: { template: "<a><slot /></a>" }, useRouter: () => ({ replace }) }));

let dashboard: ReturnType<typeof mount>;

function emit(event: AuthChangeEvent, secondsUntilExpiry: number | null) {
  const listener = onAuthStateChange.mock.calls[0][0] as (event: AuthChangeEvent, session: Pick<Session, "expires_at"> | null) => void;
  listener(event, secondsUntilExpiry === null ? null : { expires_at: Date.now() / 1000 + secondsUntilExpiry });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  dashboard = mount(StaffDashboardView, { props: { heading: "Registrar dashboard" } });
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
  signOut.mockResolvedValue({ error: null });
  await dashboard.get("button").trigger("click");
  await flushPromises();
  expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});
