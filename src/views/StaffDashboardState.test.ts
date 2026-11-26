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
import TeacherSchedulePanel from "@/components/TeacherSchedulePanel.vue";

const { client, replace } = vi.hoisted(() => ({
  client: {
    auth: { getSession: vi.fn(), onAuthStateChange: vi.fn(), signOut: vi.fn() },
    rpc: vi.fn(),
  },
  replace: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => client }));
vi.mock("vue-router", () => ({ RouterLink: { template: "<a><slot /></a>" }, useRoute: () => ({ hash: "" }), useRouter: () => ({ replace }) }));

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

// Summary Cards Across Accounts START
const statValues = () => dashboard.findAll(".portal-stat strong").map((value) => value.text());
async function switchAccount(userId: string) {
  emit("SIGNED_IN", userId);
  await vi.advanceTimersByTimeAsync(0);
  await flushPromises();
}

it("drops the previous Admin's staff counts when another Admin signs in and the list fails to load", async () => {
  expect(statValues()).toEqual(["1", "1", "0", "0"]);
  client.rpc.mockImplementation(async (name: string) => (name === "get_staff_portal_role"
    ? { data: currentRole, error: null } : { data: null, error: { code: "PGRST000", message: "offline" } }));
  await switchAccount("other-admin-id");
  expect(dashboard.find(".portal-stats").exists()).toBe(false);
});

it("drops the previous Teacher's schedule figures when another Teacher signs in and the schedule fails to load", async () => {
  dashboard.unmount();
  currentRole = "teacher";
  client.auth.onAuthStateChange.mockClear();
  client.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  dashboard = mount(StaffDashboardView, { props: { heading: "Teacher dashboard", role: "teacher" } });
  emit("INITIAL_SESSION", "teacher-one");
  await vi.advanceTimersByTimeAsync(0);
  await flushPromises();
  dashboard.findComponent(TeacherSchedulePanel).vm.$emit("loaded", { entries: [
    { day_of_week: 1, start_time: "08:00", end_time: "09:00", subject: "Math", section: "7-A", room: "101" },
  ] });
  await nextTick();
  expect(statValues()[0]).toBe("1");

  client.rpc.mockImplementation(async (name: string) => (name === "get_staff_portal_role"
    ? { data: currentRole, error: null } : { data: null, error: { code: "PGRST000", message: "offline" } }));
  await switchAccount("teacher-two");
  expect(dashboard.find(".portal-stats").exists()).toBe(false);
});
// Summary Cards Across Accounts END
