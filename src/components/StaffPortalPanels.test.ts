/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261126
 */
// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import RegistrarApplicationsPanel from "./RegistrarApplicationsPanel.vue";
import StaffAccountsPanel from "./StaffAccountsPanel.vue";

const client = vi.hoisted(() => ({ rpc: vi.fn(), auth: { getSession: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ getStaffSupabaseClient: () => client }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it.each(["registrar", "academic_coordinator"])("creates a %s account and displays it after reloading the list", async (role) => {
  client.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({
    data: [{ id: "1", full_name: "Registrar Example", email: "registrar@example.com", role, account_status: "active" }],
    error: null,
  });
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null });
  const request = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", request);
  const wrapper = mount(StaffAccountsPanel);
  try {
    await flushPromises();
    await wrapper.get('input[required]:not([type])').setValue("Registrar Example");
    await wrapper.get('input[type="email"]').setValue("registrar@example.com");
    await wrapper.get('input[type="password"]').setValue("test-password");
    await wrapper.get("form select").setValue(role);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(request).toHaveBeenCalledWith("/api/staff/accounts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      body: expect.stringContaining(`"role":"${role}"`),
    }));
    expect(wrapper.get("tbody").text()).toContain("Registrar Example");
    expect(wrapper.get<HTMLInputElement>('input[type="password"]').element.value).toBe("");
  } finally {
    wrapper.unmount();
  }
});

it("submits an Academic Coordinator role assignment for an existing account", async () => {
  const account = { id: "2", full_name: "Coordinator Example", email: "coordinator@example.com", role: "teacher", account_status: "active" };
  client.rpc.mockResolvedValue({ data: [account], error: null });
  const wrapper = mount(StaffAccountsPanel);
  try {
    await flushPromises();
    await wrapper.get("tbody button").trigger("click");
    await wrapper.get('select[aria-label="Role for Coordinator Example"]').setValue("academic_coordinator");
    await wrapper.get("tbody button").trigger("click");
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("assign_staff_role", { p_staff_id: "2", p_role: "academic_coordinator" });
  } finally {
    wrapper.unmount();
  }
});

it("labels the protected Admin and disables deactivation, role changes and resets without disabling normal staff actions", async () => {
  client.rpc.mockResolvedValue({ data: [
    { id: "1", full_name: "School Owner", role: "admin", email: "owner@example.com", account_status: "active", is_protected_admin: true },
    { id: "2", full_name: "Teacher", role: "teacher", email: "teacher@example.com", account_status: "active", is_protected_admin: false },
  ], error: null });
  const fetchRequest = vi.fn();
  vi.stubGlobal("fetch", fetchRequest);
  const wrapper = mount(StaffAccountsPanel);
  try {
    await flushPromises();
    const [protectedRow, ordinaryRow] = wrapper.findAll("tbody tr");
    expect(protectedRow.text()).toContain("Protected top-level Admin");
    const protectedButtons = protectedRow.findAll("button");
    expect(protectedButtons.find(button => button.text() === "Change role")!.element.disabled).toBe(true);
    const deactivate = protectedButtons.find(button => button.text() === "Deactivate")!;
    expect(deactivate.element.disabled).toBe(true);
    await deactivate.trigger("click");
    expect(protectedRow.text()).not.toContain("Confirm deactivation");
    expect(fetchRequest).not.toHaveBeenCalled();
    const reset = protectedButtons.find(button => button.text() === "Reset password")!;
    expect(reset.element.disabled).toBe(true);
    expect(reset.attributes("title")).toContain("trusted operator");
    await reset.trigger("click");
    expect(protectedRow.text()).not.toContain("Confirm password reset");
    expect(fetchRequest).not.toHaveBeenCalled();
    expect(ordinaryRow.findAll("button").every(button => !button.element.disabled)).toBe(true);
  } finally {
    wrapper.unmount();
  }
});

it("searches enrollment applications through the Registrar RPC with every filter", async () => {
  client.rpc.mockResolvedValue({
    data: [{ reference_no: "SNCS-TEST01", first_name: "Test", surname: "Example", grade_level: "Grade 7", status: "pending", submitted_at: "2026-11-14T00:00:00Z" }],
    error: null,
  });
  const wrapper = mount(RegistrarApplicationsPanel);
  try {
    await flushPromises();
    expect(client.rpc).toHaveBeenCalledWith("search_registrar_applications", { p_query: null, p_status: null, p_from: null, p_to: null, p_offset: 0 });
    expect(wrapper.get("tbody").text()).toContain("SNCS-TEST01");
    await wrapper.get('input[type="search"]').setValue("example");
    await wrapper.get("form select").setValue("pending");
    const [from, to] = wrapper.findAll('input[type="date"]');
    await from.setValue("2026-11-01");
    await to.setValue("2026-11-30");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(client.rpc).toHaveBeenLastCalledWith("search_registrar_applications", {
      p_query: "example", p_status: "pending", p_from: "2026-11-01", p_to: "2026-11-30", p_offset: 0,
    });
  } finally {
    wrapper.unmount();
  }
});

it("shows access denied when the session is not a Registrar", async () => {
  client.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Registrar access required" } });
  const wrapper = mount(RegistrarApplicationsPanel);
  try {
    await flushPromises();
    expect(wrapper.text()).toContain("Access denied");
  } finally {
    wrapper.unmount();
  }
});

it("shows live status counts and filters the list when a status tile is chosen", async () => {
  const row = (status: string) => ({ reference_no: `SNCS-${status}`, first_name: "Test", surname: "Example", grade_level: "Grade 7", status, submitted_at: "2026-11-14T00:00:00Z" });
  client.rpc.mockImplementation(async (_name: string, args: { p_status: string | null }) => ({
    data: args.p_status === "pending" ? [row("pending"), row("pending"), row("pending")]
      : args.p_status === "for_review" ? [row("for_review")]
      : args.p_status ? [] : [row("pending"), row("for_review")],
    error: null,
  }));
  const wrapper = mount(RegistrarApplicationsPanel, { props: { staffName: "Ana Reyes" } });
  try {
    await flushPromises();
    expect(wrapper.get("h2").text()).toBe("3 new applications to review");
    expect(wrapper.text()).toContain("Ana");
    const tiles = wrapper.findAll(".tile");
    expect(tiles.map((tile) => tile.get(".tile-count").text())).toEqual(["3", "1", "0", "0"]);
    await tiles[1].trigger("click");
    await flushPromises();
    expect(client.rpc).toHaveBeenLastCalledWith("search_registrar_applications", {
      p_query: null, p_status: "for_review", p_from: null, p_to: null, p_offset: 0,
    });
    expect(tiles[1].attributes("aria-pressed")).toBe("true");
    await tiles[1].trigger("click");
    await flushPromises();
    expect(client.rpc).toHaveBeenLastCalledWith("search_registrar_applications", {
      p_query: null, p_status: null, p_from: null, p_to: null, p_offset: 0,
    });
  } finally {
    wrapper.unmount();
  }
});

it("shows 25+ when a status has more than one page of applications", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({
    reference_no: `SNCS-${index}`, first_name: "Test", surname: "Example", grade_level: "Grade 7", status: "pending", submitted_at: "2026-11-14T00:00:00Z",
  }));
  client.rpc.mockImplementation(async (_name: string, args: { p_status: string | null }) => ({
    data: args.p_status === "pending" || !args.p_status ? rows : [], error: null,
  }));
  const wrapper = mount(RegistrarApplicationsPanel);
  try {
    await flushPromises();
    expect(wrapper.get("h2").text()).toBe("25+ new applications to review");
  } finally {
    wrapper.unmount();
  }
});
