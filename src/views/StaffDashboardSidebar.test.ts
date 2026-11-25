/*
 * Author: Gian Mandac
 * Created Date: 20261124
 * Role-based side panel of the staff dashboard: what each role sees, Super Admin vs Content Admin,
 * and shrinking the panel to an icon strip.
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, onMounted } from "vue";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StaffDashboardView from "./StaffDashboardView.vue";
import type { StaffRole } from "@/lib/staff-auth";

const { onAuthStateChange, getStaffPortalRole, accountAccess, showView } = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(), getStaffPortalRole: vi.fn(), accountAccess: { value: true as boolean | undefined }, showView: vi.fn(),
}));
vi.mock("@/lib/staff-auth", () => ({ getStaffPortalRole }));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => ({ auth: { onAuthStateChange, signOut: vi.fn() } }) }));
vi.mock("vue-router", () => ({ RouterLink: { props: ["to"], template: "<a><slot /></a>" }, useRoute: () => ({ hash: "" }), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/cms/config", () => ({ cmsPreviewEnabled: true }));
vi.mock("@/components/RegistrarApplicationsPanel.vue", () => ({ default: { template: "<div>applications</div>" } }));
// The workbench reports its open step and progress; the side panel asks it to open steps.
vi.mock("@/components/TeacherSchedulePanel.vue", () => ({ default: { template: '<section><h2 id="teacher-schedule-heading">My class schedule</h2></section>' } }));
vi.mock("@/components/CoordinatorSchedulerPanel.vue", () => ({
  default: defineComponent({
    emits: ["state"],
    setup(_props, { emit, expose }) {
      expose({ showView });
      onMounted(() => emit("state", { view: "generate", steps: [
        { id: "loads", state: "done", note: "38 assignments · 12 teachers" }, { id: "times", state: "done", note: "4 of 4 grade groups set" },
        { id: "generate", state: "now", note: "No draft generated yet" }, { id: "review", state: "todo", note: "Waiting for a draft" },
      ] }));
    },
    template: "<div>workbench</div>",
  }),
}));
// The real panel reports whether this Admin may manage staff accounts once its list loads.
vi.mock("@/components/StaffAccountsPanel.vue", () => ({
  default: defineComponent({
    emits: ["access"],
    setup(_props, { emit }) {
      onMounted(() => { if (accountAccess.value !== undefined) emit("access", accountAccess.value); });
    },
    template: '<div data-testid="staff-list">Staff accounts</div>',
  }),
}));

let dashboard: ReturnType<typeof mount> | undefined;

async function open(role: StaffRole, heading = "Dashboard") {
  getStaffPortalRole.mockResolvedValue(role);
  dashboard = mount(StaffDashboardView, { props: { heading, role } });
  const listener = onAuthStateChange.mock.calls.at(-1)![0] as (event: AuthChangeEvent, session: Pick<Session, "expires_at" | "user">) => void;
  listener("INITIAL_SESSION", { expires_at: Date.now() / 1000 + 600, user: { id: `${role}-id` } as Session["user"] });
  await vi.advanceTimersByTimeAsync(0);
  await flushPromises();
  return dashboard;
}

const navLabels = () => dashboard!.findAll(".portal-nav .portal-nav-text").map((item) => item.text());

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  localStorage.clear();
  accountAccess.value = true;
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

afterEach(() => {
  dashboard?.unmount();
  dashboard = undefined;
  vi.useRealTimers();
});

it("gives a Super Admin a short side panel: staff accounts and website content", async () => {
  await open("admin", "Admin dashboard");
  expect(navLabels()).toEqual(["Overview", "Staff accounts", "Website content"]);
  expect(dashboard!.get(".portal-hero").text()).toContain("Create account");
  expect(dashboard!.get(".portal-user-role").text()).toBe("Super Admin");
  expect(dashboard!.get('[data-testid="staff-list"]').isVisible()).toBe(true);
});

it("gives a Content Admin website content only, with content summary cards, and hides the staff list", async () => {
  accountAccess.value = false;
  await open("admin", "Admin dashboard");
  expect(navLabels()).toEqual(["Overview", "Website content"]);
  expect(dashboard!.findAll(".portal-stat .portal-stat-label").map((label) => label.text())).toEqual(["Total content", "Published", "Drafts", "Archived"]);
  expect(dashboard!.get(".portal-user-role").text()).toBe("Content Admin");
  expect(dashboard!.get('[data-testid="staff-list"]').isVisible()).toBe(false);
  expect(dashboard!.text()).toContain("Open content workspace");
});

it.each([
  ["registrar", ["Overview", "Applications"]],
  ["academic_coordinator", ["Overview", "Scheduling workbench", "Published timetable"]],
  ["teacher", ["Overview", "My schedule"]],
] as const)("shows %s only its own sections", async (role, labels) => {
  await open(role);
  expect(navLabels()).toEqual(labels);
  expect(dashboard!.find('[data-testid="staff-list"]').exists()).toBe(false);
  expect(dashboard!.text()).not.toContain("Website management");
});

it("opens the Teacher's published class schedule (PB-07) from the side panel", async () => {
  await open("teacher");
  expect(dashboard!.find(".portal-nav-soon").exists()).toBe(false);
  const item = dashboard!.findAll(".portal-nav button").find((button) => button.text().includes("My schedule"))!;
  expect(item.attributes("data-label")).toBe("My schedule");
  expect(dashboard!.get("#teacher-schedule-heading").text()).toBe("My class schedule");
});

it("shrinks the side panel to icons, keeps every item reachable, and remembers the choice", async () => {
  await open("registrar");
  const toggle = dashboard!.get(".portal-collapse");
  expect(toggle.attributes("aria-expanded")).toBe("true");
  await toggle.trigger("click");
  expect(dashboard!.get(".portal").classes()).toContain("portal-collapsed");
  expect(toggle.attributes("aria-expanded")).toBe("false");
  expect(toggle.attributes("aria-label")).toBe("Expand side panel");
  // Icons stay, and each item keeps its name for screen readers and the hover label.
  const items = dashboard!.findAll(".portal-nav .portal-nav-item");
  expect(items.map((item) => item.find("svg").exists())).toEqual([true, true]);
  expect(items.map((item) => item.attributes("data-label"))).toEqual(["Overview", "Applications"]);
  expect(localStorage.getItem("sncs-staff-sidebar")).toBe("collapsed");

  dashboard!.unmount();
  await open("registrar");
  expect(dashboard!.get(".portal").classes()).toContain("portal-collapsed");
});

it("opens the scheduling workbench at its current step, and the published timetable, from the side panel", async () => {
  await open("academic_coordinator", "Academic Coordinator dashboard");
  expect(dashboard!.find(".portal-step-dot").exists()).toBe(false);
  expect(dashboard!.get(".portal-nav-active").text()).toContain("Scheduling workbench");
  expect(dashboard!.get(".portal-breadcrumb strong").text()).toBe("Scheduling workbench");
  expect(dashboard!.find(".portal-hero").exists()).toBe(false);
  expect(dashboard!.get("h1").text()).toBe("Academic Coordinator dashboard");

  const items = dashboard!.findAll(".portal-nav button");
  await items.find((item) => item.text().includes("Scheduling workbench"))!.trigger("click");
  expect(showView).toHaveBeenLastCalledWith("checks");
  await items.find((item) => item.text().includes("Published timetable"))!.trigger("click");
  expect(showView).toHaveBeenLastCalledWith("teacher");
  expect(dashboard!.get(".portal-nav-active").text()).toContain("Published timetable");
});
