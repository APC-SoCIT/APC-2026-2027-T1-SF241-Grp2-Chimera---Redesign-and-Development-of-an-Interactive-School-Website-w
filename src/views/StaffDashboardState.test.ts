/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261119
 */
// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StaffDashboardView from "./StaffDashboardView.vue";

const { client, replace } = vi.hoisted(() => ({
  client: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
    rpc: vi.fn(),
  },
  replace: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => client }));
vi.mock("vue-router", () => ({ RouterLink: { template: "<a><slot /></a>" }, useRouter: () => ({ replace }) }));

let dashboard: VueWrapper;
let currentRole: string;
const account = { id: "2", full_name: "Test Teacher", email: "teacher@example.com", role: "teacher", account_status: "active" };

function emit(event: AuthChangeEvent, userId = "admin-id") {
  const session = { access_token: "test-token", expires_at: Date.now() / 1000 + 3600, user: { id: userId } };
  client.auth.getSession.mockResolvedValue({ data: { session }, error: null });
  const listener = client.auth.onAuthStateChange.mock.calls[0][0] as
    (event: AuthChangeEvent, session: Pick<Session, "expires_at" | "user">) => void;
  listener(event, session as Session);
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  currentRole = "admin";
  client.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  client.rpc.mockImplementation(async (name: string) => ({
    data: name === "get_staff_portal_role" ? currentRole : [account], error: null,
  }));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, json: async () => ({ temporaryPassword: "new-temporary-password" }),
  }));
  dashboard = mount(StaffDashboardView, { props: { heading: "Admin dashboard", role: "admin" } });
  emit("INITIAL_SESSION");
  await vi.advanceTimersByTimeAsync(0);
  await flushPromises();
});

afterEach(() => {
  dashboard.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Dashboard Work Preservation START
it.each(["SIGNED_IN", "TOKEN_REFRESHED"] as const)("preserves unfinished forms and temporary passwords through %s for the same Admin", async (event) => {
  const reset = dashboard.findAll("button").find(button => button.text() === "Reset password")!;
  await reset.trigger("click");
  const confirm = dashboard.findAll("button").find(button => button.text() === "Confirm")!;
  await confirm.trigger("click");
  await flushPromises();
  await dashboard.get('input[required]:not([type])').setValue("Unfinished Name");
  await dashboard.get('input[type="email"]').setValue("unfinished@example.com");
  await dashboard.get('input[type="password"]').setValue("unfinished-password");
  const originalForm = dashboard.get("form").element;
  expect(dashboard.get("code").text()).toBe("new-temporary-password");
  const listReads = client.rpc.mock.calls.filter(([name]) => name === "list_staff_accounts").length;

  emit(event);
  await vi.advanceTimersByTimeAsync(0);
  await flushPromises();
  expect(dashboard.get("form").element).toBe(originalForm);
  expect(dashboard.get<HTMLInputElement>('input[required]:not([type])').element.value).toBe("Unfinished Name");
  expect(dashboard.get<HTMLInputElement>('input[type="email"]').element.value).toBe("unfinished@example.com");
  expect(dashboard.get<HTMLInputElement>('input[type="password"]').element.value).toBe("unfinished-password");
  expect(dashboard.get("code").text()).toBe("new-temporary-password");
  expect(client.rpc.mock.calls.filter(([name]) => name === "list_staff_accounts")).toHaveLength(listReads);
  expect(replace).not.toHaveBeenCalled();

  currentRole = "teacher";
  emit("SIGNED_IN", "teacher-id");
  await nextTick();
  expect(dashboard.find("form").exists()).toBe(false);
  expect(dashboard.text()).not.toContain("new-temporary-password");
  await vi.advanceTimersByTimeAsync(0);
  expect(replace).toHaveBeenCalledWith({ name: "login" });
});
// Dashboard Work Preservation END
